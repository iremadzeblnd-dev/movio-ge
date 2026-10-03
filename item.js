const DETAIL_PAGES = {
  "electric-scooters": "electric-scooters.html",
  "electric-bikes": "electric-bikes.html",
  "quad-bikes": "quad-bikes.html",
  "car-accessories": "car-accessories.html",
};

function getQueryValue(name) {
  const pairs = window.location.search.replace(/^\?/, "").split("&");

  for (let index = 0; index < pairs.length; index += 1) {
    const parts = pairs[index].split("=");
    if (decodeURIComponent(parts[0] || "") === name) {
      return decodeURIComponent((parts[1] || "").replace(/\+/g, " "));
    }
  }

  return null;
}

const itemId = getQueryValue("item");
const detailPage = DETAIL_PAGES[itemId];

if (detailPage) {
  window.location.replace(detailPage);
} else {
  document.querySelector(".item-page-detail").hidden = true;
  document.querySelector(".item-page-not-found").hidden = false;
  document.title = "MOVIO — პროდუქტი ვერ მოიძებნა";
}
