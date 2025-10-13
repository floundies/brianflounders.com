(function () {
  try {
    var loc = window.location;
    var path = loc.pathname || "/";
    var hash = loc.hash || "";

    // 1) If we arrived via hash routes, convert to canonical path (for sharing / future SSR)
    if (hash && hash[1] === "/") {
      var route = hash.slice(1); // drop leading "#"
      var mPostH = route.match(/^\/post\/([^/?#]+)/i);
      if (mPostH && mPostH[1]) {
        loc.replace("/post/" + encodeURIComponent(mPostH[1]));
        return;
      }
      var mTagH = route.match(/^\/tag\/([^/?#]+)/i);
      if (mTagH && mTagH[1]) {
        loc.replace("/tag/" + encodeURIComponent(mTagH[1]));
        return;
      }
      // if hash is something else, let the SPA handle it
    }

    // 2) If we arrived via path routes (no SSR yet), map back to hash so the SPA renders the right view
    //    This is temporary. We'll remove this after SSR Functions are added.
    if (!hash || hash.length < 2) {
      var mPostP = path.match(/^\/post\/([^/?#]+)/i);
      if (mPostP && mPostP[1]) {
        loc.replace("/#/post/" + encodeURIComponent(mPostP[1]));
        return;
      }
      var mTagP = path.match(/^\/tag\/([^/?#]+)/i);
      if (mTagP && mTagP[1]) {
        loc.replace("/#/tag/" + encodeURIComponent(mTagP[1]));
        return;
      }
    }
  } catch (e) {
    // swallow
  }
})();