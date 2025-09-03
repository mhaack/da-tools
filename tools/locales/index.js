/* eslint-disable import/no-unresolved */
import { Queue } from 'https://da.live/nx/public/utils/tree.js';

const AEM_ORIGIN = 'https://admin.hlx.page';
const DA_ORIGIN = 'https://admin.da.live';
const LANG_CONF = '/.da/translate-v2.json';

export const [setContext, getContext] = (() => {
  let ctx;
  return [
    (supplied) => {
      ctx = (() => {
        const {
          org, repo: site, path, token,
        } = supplied;
        return {
          org, site, path, token,
        };
      })();
      return ctx;
    },
    () => ctx,
  ];
})();

export async function getPage(org, site, path) {
  const { token } = getContext();
  const opts = { headers: { Authorization: `Bearer ${token}` } };
  const resp = await fetch(`${DA_ORIGIN}/source/${org}/${site}${path}.html`, opts);
  return resp.status === 200;
}

async function fetchStatus(org, site, aemPath) {
  const { token } = getContext();
  const opts = { headers: { Authorization: `Bearer ${token}` } };
  const statusUrl = `${AEM_ORIGIN}/status/${org}/${site}/main${aemPath}`;
  try {
    const res = await fetch(statusUrl, opts);
    if (!res.ok) { throw new Error(res.status); }
    const data = await res.json();
    return { preview: data.preview, live: data.live };
  } catch {
    return null;
  }
}

export async function getLangsAndLocales(path) {
  const { org, site, token } = getContext();
  const opts = { headers: { Authorization: `Bearer ${token}` } };

  const params = new URLSearchParams(window.location.search);
  const globalConfig = params.get('global');
  const configSource = globalConfig || `/${org}/${site}`;
  const resp = await fetch(`${DA_ORIGIN}/source${configSource}${LANG_CONF}`, opts);
  if (!resp.ok) return { message: { text: 'There was an error fetching languages.', type: 'error' } };
  const sheet = await resp.json();
  const { data: langData } = sheet.languages;
  const { data: localeData } = sheet.locales;

  const langs = langData.map((row) => ({ name: row.name, location: row.location, site: row.site ? row.site.replace(/^\//, '') : site }));

  const locales = localeData.map((row) => {
    const localeLangs = langs.map((lang) => {
      const localeLang = {
        name: lang.name,
        site: row.site ? row.site.replace(/^\//, '') : site,
        globalLocation: lang.location,
        location: row.location ? `${lang.location}-${row.location.replace('/', '')}` : lang.location,
        status: false,
      };
      localeLang.pagePath = `${localeLang.location}/${path.split('/').slice(2).join('/')}`;
      return localeLang;
    });

    return {
      ...row,
      langs: localeLangs,
    };
  });

  return { langs, locales };
}

export async function populatePageData(locales) {
  const { org } = getContext();

  const updatedLocales = await Promise.all(locales.map(async (row) => {
    const localeLangs = await Promise.all(row.langs.map(async (localeLang) => {
      const [exists, aemStatus] = await Promise.all([
        getPage(org, localeLang.site, localeLang.pagePath),
        fetchStatus(org, localeLang.site, localeLang.pagePath),
      ]);

      return {
        ...localeLang,
        status: true,
        exists,
        aemStatus,
      };
    }));

    return {
      ...row,
      langs: localeLangs,
    };
  }));

  return updatedLocales;
}

export async function copyPage(sourcePath, destPath) {
  const { token } = getContext();
  const body = new FormData();
  body.append('destination', `${destPath}.html`);
  const opts = { method: 'POST', body, headers: { Authorization: `Bearer ${token}` } };
  await fetch(`${DA_ORIGIN}/copy${sourcePath}.html`, opts);
}

export async function publishPages(pages) {
  const { token } = getContext();
  const opts = { method: 'POST', headers: { Authorization: `Bearer ${token}` } };

  const publish = async (url) => {
    let resp = await fetch(`${AEM_ORIGIN}/preview${url.path}`, opts);
    if (resp.status === 200) {
      resp = await fetch(`${AEM_ORIGIN}/live${url.path}`, opts);
    }
    url.status = resp.status;
  };

  const queue = new Queue(publish, 5);

  return new Promise((resolve) => {
    const throttle = setInterval(() => {
      const nextUrl = pages.find((url) => !url.inProgress);
      if (nextUrl) {
        nextUrl.inProgress = true;
        queue.push(nextUrl);
      } else {
        console.log(pages);
        const finished = pages.every((url) => url.status);
        if (finished) {
          clearInterval(throttle);
          resolve(pages);
        }
      }
    }, 250);
  });
}
