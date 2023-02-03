// SPDX-License-Identifier: MIT

var refRefresh;

String.prototype.ppsec = function () {
	var pad = function(input) {return input < 10 ? "0" + input : input;};
	var sec_num = parseInt(this, 10); // don't forget the second param
	var hours   = Math.floor(sec_num / 3600);
	var minutes = Math.floor((sec_num % 3600) / 60);
	var seconds = sec_num % 60;

	if (sec_num < 60) {
		return seconds+"s";
	}

	var r='';
	if (hours > 0) {
		r = hours+'h ';
	}
	return r+minutes+':'+pad(seconds);
}

function refresh() {
	clearInterval(refRefresh);
	refRefresh = window.setInterval(refresh, 30000);

        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
                if (xhr.readyState == 4) {
                        var stateObj = JSON.parse(xhr.responseText);
                        rebuildTable(stateObj);
                }
        };

        var cachebust = new Date().getTime();
        xhr.open("GET", "totalcount.json?" + cachebust, true);
        xhr.send();

}

function doInit() {
	var getconf = $.ajax({ url: 'mirror_regions.json',
					timeout: 3000,
					cache: true,
					dataType: 'json' });
	getconf.done(function(data) {
		// We have the JSON in data, walk it and build the initial table...
		var table = document.getElementById("regiontable");
		var table_tbody = document.createElement('tbody');

		var regions = Object.keys(data);

		for (var row = 0; row < regions.length; ++row) {

			var region_enabled = data[regions[row]].enabled;

			var region_num = data[regions[row]].region;
			var region_name = data[regions[row]].name;

			var table_tr = document.createElement('tr');

			// 4 columns: Region, Count, Description, Status
			var td_region = document.createElement('td');
			var td_count = document.createElement('td');
			var td_description = document.createElement('td');
			var td_status = document.createElement('td');

			if (region_enabled) {
				td_region.innerHTML = "<a href=\"" + region_num + "\" class=\"rowlink\">Region " + region_num + "</a>";
				td_count.innerHTML = "0";
				td_count.id = "R-" + region_num;
				td_description.innerHTML = region_name;
				td_status.className = "status";
				td_status.id = "R-" + region_num + "-age";
			} else {
				table_tr.className = " disabled";
				td_region.innerHTML = "Region " + region_num;
				td_count.innerHTML = "-";
				td_count.id = "R-" + region_num;
				td_count.className = " disabled";
				td_description.innerHTML = region_name;
				td_status.innerHTML = "DISABLED";
			}

			table_tr.appendChild(td_region);
			table_tr.appendChild(td_count);
			table_tr.appendChild(td_description);
			table_tr.appendChild(td_status);
			table_tbody.appendChild(table_tr);
		}
		table.appendChild(table_tbody);
		refRefresh = window.setInterval(refresh, 20);
	});

}

function rebuildTable(state) {

        var regions = Object.keys(state);
	regions.sort();

	var UP = "UPDATED";
	var total_mlat = 0;
	var total_regions = 0;

	var NOW = Math.floor(new Date() / 1000);

	var count, updated, region, regiondata, countref, countId, ageref, diff;

	var date = new Date();
	var dateopts = {
		weekday: "short",
		year: "numeric",
		month: "short",
		day: "numeric",
		hourCycle: "h24",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZoneName: "short"
	}
	$( "#current_time" ).html( date.toLocaleTimeString("en-US", dateopts) );

	for (var i = 0; i < regions.length; ++i) {
		region = regions[i];
		regiondata = state[regions[i]];
		countref = "#R-" + region;
		countId = "R-" + region;
		ageref = "#R-" + region + "-age";

		var count_check = document.getElementById(countId);
		if (count_check && count_check.classList.contains("disabled")) {
			continue;
		}

		if ( region.toString() == UP.toString() ) {
			$( "#updated" ).html( regiondata );
		} else {
			count = regiondata[0];
			updated = regiondata[2];

			if ( updated < 100000 ) {
				$(ageref).html("* ERROR, no data *");
				$(ageref).attr( "class", "status_stale" );
			} else {
				diff = NOW - updated;
				var ds = diff.toString(10);

				if ( diff > 120) {
					if ( diff > 240) {
						if ( diff > 480) {
							$(ageref).html("STALE (" + ds.ppsec() + " old)");
							$(ageref).attr( "class", "status_stale480" );
						} else {
							$(ageref).html("STALE (" + ds.ppsec() + " old)");
							$(ageref).attr( "class", "status_stale240" );
						}
					} else {
						$(ageref).html("OK (" + ds.ppsec() + " old)");
						$(ageref).attr( "class", "status_stale120" );
					}
				} else {
					$(ageref).html("OK (" + ds.ppsec() + " old)");
					$(ageref).attr( "class", "status_ok" );
				}
			}

			$( countref ).html( count );
			var count_check = document.getElementById(countref);

			if (!isNaN(count)) {
				total_mlat += count;
			}
			total_regions++;
		}

	}
	$( "#totalregions" ).text( total_regions );
	$( "#totalcount" ).text( total_mlat );
}


function hasClass(element, cls) {
	    return (' ' + element.className + ' ').indexOf(' ' + cls + ' ') > -1;
}


