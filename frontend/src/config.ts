export const BACKEND_HOST = 'catalogs-includes-chronicles-considering.trycloudflare.com'

export const ICE_SERVERS = await (async ()=> {
    const response = await fetch(`https://${BACKEND_HOST}/ice-servers`)
    return await response.json();
})();