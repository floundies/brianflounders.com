(function () {
  try {
    var loc  = window.location;
    var path = loc.pathname || "/";
    var hash = loc.hash || "";

    // If the server redirected us to the bogus "/post/:id" path
    // but we still have the original hash (e.g. #/tag/bitcoin),
    // immediately restore the hash route so the SPA renders correctly.
    if (path === "/post/:id" && hash && hash[1] === "/") {
      loc.replace("/" + hash); // -> "/#/tag/bitcoin" (or "/#/post/…")
      return;
    }

    // Normal path→hash mapping (no SSR):
    // If there's no hash yet, translate real paths so the hash-router shows the right view.
    if (!hash || hash.length < 2) {
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
    }
    // If we're already on a hash route, do nothing.
  } catch (e) {
    // no-op
  }
})();