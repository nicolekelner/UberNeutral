let global = {};

$(_ => {
  chrome.runtime.sendMessage({requestData: true}, function (response) {
    global.cities = new Map(response.data.cities);
    global.payment = new Map(response.data.payment);
    global.trips = new Map(response.data.trips);
    global.drivers = new Map(response.data.drivers);
    startStatistics();
  });
});

function startStatistics() {
  console.log(global);

  addTotalRidesStat();
  addTotalPaymentMethodsStat();

  calculateMoneySpent();
  calculateTripTypesStat();
  // calculateTripCompletionStats();
  // calculateTripLengthsStat();
  // calculateDriverStats();
  // calculateCityStats();
  // calculatePickupAndDropoffStats();
  // calculateMonthAndYearStats();
  calculateDistanceStats();
  // calculateCarMakeStats();

  // addTripsAndSpentByMonthChart();
}

function addTotalRidesStat() {
  // Total # trips
  $("#total-rides").text(global.trips.size);
}

function addTotalPaymentMethodsStat() {
  // Total # payment methods
  $("#num-payment").text(global.payment.size);
}

function calculateMoneySpent() {
  let totalSpent = {};
  let totalAcrossAllCurrencies = 0;
  let completedTrips = 0;
  global.trips.forEach(t => {
    if (t.clientFare) {
      if (!totalSpent.hasOwnProperty(t.currencyCode)) {
        totalSpent[t.currencyCode] = 0;
      }
      totalSpent[t.currencyCode] += t.clientFare;

      totalAcrossAllCurrencies += getCurrencyConversionIfExists(t.currencyCode, t.clientFare);
    }
    if (t.status === "COMPLETED") {
      completedTrips++;
    }
  });

  // $ spent stats
  $("#total-payment").text("$" + totalAcrossAllCurrencies.toFixed(2));
  let totalSpentText = "";
  let currencyKeys = getSortedKeysFromObject(totalSpent, true);
  for (const key of currencyKeys) {
    let currencySymbol = getSymbolFromCode(key);
    totalSpentText += `<span class="subheading">${key}</span><span class="stat"> ${currencySymbol + totalSpent[key].toFixed(2)}</span><br>`;
  }
  $("#total-spent").html(totalSpentText);
  $("#average-price").text("~$" + (totalAcrossAllCurrencies / completedTrips).toFixed(2));
  // addPriceChart();
}

function calculateTripTypesStat() {
  let tripTypes = {};
  let poolTypesCount = 0;
  let otherTypesCount = 0;

  global.trips.forEach(t => {
    if (t.vehicleViewName) {
      let name = t.vehicleViewName;
      // Some have :MATCHED appended, randomly?
      name = name.split(":")[0];
      name = uppercaseFirst(name);
      if (!tripTypes.hasOwnProperty(name)) {
        tripTypes[name] = 0;
      }
      tripTypes[name]++;

      if(name == 'Pool' || name == 'Express pool') {
        poolTypesCount++;
      } else {
        otherTypesCount++;
      }
    }
  });

  console.log("pool types, non pool-types", poolTypesCount, otherTypesCount);
  const percentPoolTypes = Math.round(100 * (poolTypesCount / (poolTypesCount + otherTypesCount)));
  $("#pool-percent").html(`${percentPoolTypes}%`);

  let rideTypesText = constructTextSpan(tripTypes, true);
  $("#rides-by-type").html(rideTypesText);
}

function _genTimeLink(id, time) {
  return `<a target="_blank" class="link" href="https://riders.uber.com/trips/${id}">${time} Minutes</a>`;
}

function calculateTripLengthsStat() {
  let tripLengths = [];
  global.trips.forEach(t => {
    if (t.status === "COMPLETED") {
      let requestTime = new Date(t.requestTime);
      let dropoffTime = new Date(t.dropoffTime);
      let lengthMs = dropoffTime.getTime() - requestTime.getTime();
      tripLengths.push({
        time: lengthMs,
        id: t.uuid
      });
    }
  });
  // Trip lengths
  tripLengths.sort((a, b) => a.time - b.time);

  const shortestTime = Math.abs(Math.round(tripLengths[0].time / (60 * 1000)));
  const longestTime = Math.abs(Math.round(tripLengths[tripLengths.length - 1].time / (60 * 1000)));

  $("#shortest-ride").html(_genTimeLink(tripLengths[0].id, shortestTime));
  $("#longest-ride").html(_genTimeLink(tripLengths[tripLengths.length - 1].id, longestTime));
  let totalTimeText = "";
  let totalTime = 0;
  for (const trip of tripLengths) {
    totalTime += trip.time;
  }
  totalTimeText += `<span class="subheading">Seconds</span><span class="stat"> ${Math.round(totalTime /= 1000)}</span><br>`;
  if (totalTime > 60) {
    totalTimeText += `<span class="subheading">Minutes</span><span id="minutes" class="stat"> ${Math.round(totalTime /= 60)}</span><br>`;
  }
  if (totalTime > 60) {
    totalTimeText += `<span class="subheading">Hours</span><span class="stat"> ${Math.round(totalTime /= 60)}</span><br>`;
  }
  if (totalTime > 24) {
    totalTimeText += `<span class="subheading">Days</span><span class="stat"> ${(totalTime /= 24).toFixed(2)}</span><br>`;
  }

  $("#total-time").html(totalTimeText);
}

function calculateTripCompletionStats() {
  let canceledTrips = 0;
  let completedTrips = 0;
  let driverCanceledTrips = 0;
  let surgeTrips = 0;

  global.trips.forEach(t => {
    if (t.isSurgeTrip) {
      surgeTrips++;
    }
    if (t.status === "COMPLETED") {
      completedTrips++;
    } else if (t.status === "CANCELED") {
      canceledTrips++;
    } else if (t.status === "DRIVER_CANCELED") {
      driverCanceledTrips++;
    }
  });

  // Completed and canceled rides
  $("#canceled-rides").text(canceledTrips);
  $("#completed-rides").text(completedTrips);
  $("#surge-rides").text(surgeTrips);
  $("#driver-canceled-rides").text(driverCanceledTrips);
}

function calculateDriverStats() {
  let driverCounts = {};

  global.trips.forEach(t => {
    if (t.driverUUID) {
      if (!driverCounts.hasOwnProperty(t.driverUUID)) {
        driverCounts[t.driverUUID] = 0;
      }
      driverCounts[t.driverUUID]++;
    }
  });
  let drivers = getSortedKeysFromObject(driverCounts, true);
  let iterNum = Math.min(5, drivers.length);
  let driverText = "";
  for (let i = 0; i < iterNum; i++) {
    const favoriteDriver = global.drivers.get(drivers[i]);
    const firstname = favoriteDriver.firstname || "";
    driverText += `<span class="subheading">${firstname}</span><span class="stat"> ${driverCounts[favoriteDriver.uuid]} rides</span><br>`;
  }
  $("#same-driver").html(driverText);
}

function calculateCityStats() {
  let cityCounts = {};

  global.trips.forEach(t => {
    if (t.cityID) {
      if (!cityCounts.hasOwnProperty(t.cityID)) {
        cityCounts[t.cityID] = 0;
      }
      cityCounts[t.cityID]++;
    }
  });

  let cities = getSortedKeysFromObject(cityCounts, true);
  let cityCountsText = '';
  for (const key of cities) {
    cityCountsText += `<span class="subheading">${global.cities.get(parseInt(key)).name}</span><span class="stat"> ${cityCounts[key]}</span><br>`;
  }
  $("#rides-by-city").html(cityCountsText);
}

function calculatePickupAndDropoffStats() {
  let pickups = {};
  let dropoffs = {};
  global.trips.forEach(t => {
    if (t.dropoffFormattedAddress) {
      if (!dropoffs.hasOwnProperty(t.dropoffFormattedAddress)) {
        dropoffs[t.dropoffFormattedAddress] = 0;
      }
      dropoffs[t.dropoffFormattedAddress]++;
    }
    if (t.begintripFormattedAddress) {
      if (!pickups.hasOwnProperty(t.begintripFormattedAddress)) {
        pickups[t.begintripFormattedAddress] = 0;
      }
      pickups[t.begintripFormattedAddress]++;
    }
  });

  let pickupText = constructTextSpan(pickups, true, 3);
  $("#fave-pickup").html(pickupText);

  let dropoffText = constructTextSpan(dropoffs, true, 3);
  $("#fave-dropoff").html(dropoffText);
}

function calculateMonthAndYearStats() {
  let years = {};
  let months = {};
  const today = new Date();
  let totalSpentThisYear = {};
  global.trips.forEach(t => {
    let date = new Date(t.requestTime);
    let year = date.getFullYear();
    let month = date.toLocaleString("en-us", {
      month: "long"
    });

    if (date.getFullYear() === today.getFullYear()) {
      if (!totalSpentThisYear.hasOwnProperty(month)) {
        totalSpentThisYear[month] = 0;
      }
      totalSpentThisYear[month] += getCurrencyConversionIfExists(t.currencyCode, t.clientFare)
    }

    if (!years.hasOwnProperty(year)) {
      years[year] = 0;
    }
    years[year]++;
    if (!months.hasOwnProperty(month)) {
      months[month] = 0;
    }
    months[month]++;

    // In here you can calculate and set the field for year when started riding
  });

  let yearKeys = Object.keys(years);
  yearKeys.sort((a, b) => {
    return yearKeys[a] - yearKeys[b];
  });
  let yearText = '';
  for (const key of yearKeys) {
    yearText += `<span class="subheading">${key}</span><span class="stat"> ${years[key]}</span><br>`;
  }
  $("#rides-by-year").html(yearText);
  // object which holds the order value of the month
  const monthNames = {
    "January": 1,
    "February": 2,
    "March": 3,
    "April": 4,
    "May": 5,
    "June": 6,
    "July": 7,
    "August": 8,
    "September": 9,
    "October": 10,
    "November": 11,
    "December": 12
  };

  let monthKeys = Object.keys(months);
  monthKeys.sort((a, b) => {
    return monthNames[a] - monthNames[b];
  });
  let monthText = '';
  for (const key of monthKeys) {
    monthText += `<span class="subheading">${key}</span><span class="stat"> ${months[key]}</span><br>`;
  }
  $("#rides-by-month").html(monthText);

  let monthSpentKeys = Object.keys(totalSpentThisYear);
  monthSpentKeys.sort((a, b) => {
    return monthNames[a] - monthNames[b];
  });
  let monthlySpendSoFar = '';
  for (const key of monthSpentKeys) {
    monthlySpendSoFar += `<span class="subheading">${key}</span><span class="stat">$${totalSpentThisYear[key].toFixed(2)}</span><br>`;
  }
  $("#monthly-prices").html(monthlySpendSoFar);

}

function calculateDistanceStats() {
  let distances = {};

  global.trips.forEach(t => {
    if (t.receipt) {
      let receipt = t.receipt;
      if (!distances.hasOwnProperty(receipt.distance_label)) {
        distances[receipt.distance_label] = 0;
      }
      distances[receipt.distance_label] += parseFloat(receipt.distance);
    }
  });
  console.log("distances", distances);
  let totalMiles = 0;
  if(distances.miles) {
    totalMiles += distances.miles;
  }
  if(distances.kilometers) {
    totalMiles += (distances.kilometers * 0.62);
  }
  totalMiles = Math.round(totalMiles * 100) / 100;
  console.log("actual total distance in miles", totalMiles);
  const milesText = `<span class="stat"> ${totalMiles} miles</span><br>`;
  $("#total-miles").html(milesText);

  const carbonTonnes = Math.round(totalMiles * 0.000445334 * 100) / 100;
  const carbonText = `<span class="stat"> ${carbonTonnes} tonnes</span><br>`;
  $("#total-carbon").html(carbonText);

  const carbonTonnesRounded = Math.ceil(carbonTonnes);
  const costToOffset = Math.round(100 * carbonTonnesRounded * 16.5) / 100;

  const linkToNori = `https://nori.com/remove-carbon/checkout?tonnes=${carbonTonnesRounded}.00`;
  const linkHTML = `<a href=${linkToNori}> Offset now for $${costToOffset}</span><br>`;
  $("#link-to-nori").html(linkHTML);

  console.log("THINGS", linkToNori, costToOffset);

  let distanceKeys = getSortedKeysFromObject(distances, true);
  if (distanceKeys.length) {
    $(".hidden").removeClass("hidden");
    let distanceText = '';
    for (const key of distanceKeys) {
      distanceText += `<span class="subheading">${uppercaseFirst(key)}</span><span class="stat"> ${Math.round(distances[key])}</span><br>`;
    }
    $("#distances").html(distanceText);
  }
}

function calculateCarMakeStats() {
  let carMakes = {};

  global.trips.forEach(t => {
    if (t.receipt) {
      let receipt = t.receipt;
      if (!carMakes.hasOwnProperty(receipt.car_make)) {
        carMakes[receipt.car_make] = 0;
      }
      carMakes[receipt.car_make]++;
    }
  });

  if (Object.keys(carMakes).length) {
    $(".hidden").removeClass("hidden");
    let carText = constructTextSpan(carMakes, true, 3);
    $("#rides-by-car").html(carText);
  }
}