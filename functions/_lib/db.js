export function json(data, init) {
  var headers = Object.assign({ "Content-Type": "application/json" }, (init && init.headers) || {});
  return new Response(JSON.stringify(data), Object.assign({}, init, { headers: headers }));
}

export function newId() {
  return crypto.randomUUID();
}
