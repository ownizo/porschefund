/* Porsche Fund visit counter: no cookies, no local storage, no personal data. */
(function () {
  try {
    if (localStorage.getItem("pf_notrack") === "1") return;
  } catch (e) {}
  var pid = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  var params = new URLSearchParams(location.search);
  var visibleMs = 0;
  var since = document.visibilityState === "visible" ? performance.now() : null;

  function send(body) {
    var data = JSON.stringify(body);
    if (navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([data], { type: "text/plain" }))) return;
    fetch("/api/track", { method: "POST", body: data, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(function () {});
  }

  send({
    t: "v",
    pid: pid,
    p: location.pathname,
    r: document.referrer || "",
    u: params.get("utm_source") || params.get("ref") || "",
    wd: navigator.webdriver === true
  });

  function flush() {
    if (since !== null) {
      visibleMs += performance.now() - since;
      since = null;
    }
    send({ t: "d", pid: pid, ms: Math.round(visibleMs) });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
    else since = performance.now();
  });
  window.addEventListener("pagehide", function () {
    if (since !== null) flush();
  });
})();
