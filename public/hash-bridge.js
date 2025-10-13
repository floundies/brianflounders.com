(function () {
  try {
    var loc = window.location;
    var path = loc.pathname || "/";
    var hash = loc.hash || "";

    // If already on a hash route, do nothing.
    if (hash && hash[1] === "/") return;

    // TEMP (no-SSR): translate path routes to your hash routes so the SPA renders the right view.
    var mPost = path.match(/^\/post\/([^/?#]+)/i);
    if (mPost && mPost[1]) {
      loc.replace("/#/post/" + encodeURIComponent(mPost[1]));
      return;
    }
    var mTag = path.match(/^\/tag\/([^/?#]+)/i);
    if (mTag && mTag[1]) {
      loc.replace("/#/tag/" + encodeURIComponent(mTag[1]));
      return;
    }
  } catch (e) {
    // ignore
  }
})();
