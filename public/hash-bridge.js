(function () {
  try {
    var h = window.location.hash || "";
    if (!h || h.length < 3 || h[1] !== "/") return; // only handle #/...

    // strip leading "#"
    var route = h.slice(1);

    // patterns we support: #/post/<id>  and  #/tag/<slug>
    var mPost = route.match(/^\/post\/([^/?#]+)/i);
    if (mPost && mPost[1]) {
      var id = mPost[1];
      window.location.replace("/post/" + encodeURIComponent(id));
      return;
    }

    var mTag = route.match(/^\/tag\/([^/?#]+)/i);
    if (mTag && mTag[1]) {
      var slug = mTag[1];
      window.location.replace("/tag/" + encodeURIComponent(slug));
      return;
    }
  } catch (e) {
    // no-op
  }
})();
