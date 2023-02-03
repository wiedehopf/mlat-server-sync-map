// SPDX-License-Identifier: MIT

var my_region;

function doInit() {
	my_region = findBaseName(window.location.pathname);
	// Put this here.  HTML needs to call the text field "searchbar"
	$( "#searchbar" ).on("keyup", function(ch) {
		// console.log("Keyup: [" + ch.which + "]");
		if (ch.which == 13) {
			search();
		} else {
			var v = $(this).val();
			if ((v.length > 2) || (v.length == 0)) {
				search();
			}
		}
	});
}


function search() {
	// Declare variables
	var input, filter, table, tr, td, i, txtValue;

	input = document.getElementById("searchbar");
	filter = input.value.toUpperCase();
	// console.log("Search called: [" + filter + "]");
	table = document.getElementById("syncstatstable");
	tr = table.getElementsByTagName("tr");

	// Only search if:
	//  * Enter pressed
	//    or
	//  * length greater than 2

	// Loop through all table rows, and hide those who don't match the search query
	for (i = 0; i < tr.length; i++) {
		td = tr[i].getElementsByTagName("td")[0];
		if (td) {
			txtValue = td.textContent || td.innerText;
			if (txtValue.toUpperCase().indexOf(filter) > -1) {
				tr[i].style.display = "";
			} else {
				tr[i].style.display = "none";
			}
		}
	}
	$("#syncstatstable").tablesorter({
		headers: { 0: { sorter: "text" } },
		cssAsc: 'up',
		cssDesc: 'down',
		cssNone: 'unsort'
	});
	$( '#syncstatstable' ).data('tablesorter').sortList = [[0,0]];
	$( '#syncstatstable' ).trigger( 'updateHeaders');
	$( '#syncstatstable' ).trigger( 'update');
	$( '#syncstatstable' ).trigger( 'updateCache');
}


function refresh() {
	document.title = "Region " + my_region + " - Sync Stats"
	$("#REGION").text(my_region);

        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
                if (xhr.readyState == 4) {
                        var stateObj = JSON.parse(xhr.responseText);
                        rebuildTable(stateObj);
                }
        };

        var cachebust = new Date().getTime();
        xhr.open("GET", "sync.json?" + cachebust, true);
        xhr.send();
}

function rebuildTable(state) {

	//var CIRCLE = "&#11044;";
	//var RECT = "&#9646;";
	//var BLOCK = "&#9608;";
	//var SHADE_BLOCK = "&#9619;";

	//var grid_icon = CIRCLE;

        var table = document.getElementById("syncstatstable");
        while (table.firstChild) {
                table.removeChild(table.firstChild);
        }


        var receivers = Object.keys(state);
        receivers.sort();
	// Zip thru the list, build a reference
	var overall_record = [];
	var overall_record_r = {};
	var ppm = 0;
	for (var i = 0; i < receivers.length; ++i) {
                var receiver_state = state[receivers[i]].peers;
		var rec_peers = Object.keys(receiver_state); // (Don't need to sort this)

		var status_sum = 0;
		for (var p = 0; p < rec_peers.length; ++p) {
			var syncstate = receiver_state[rec_peers[p]];
			// 0 = sync count
			//  state[0] >= 10 = good (green), otherwise yellow
			if (syncstate[0] >= 10) {
				status_sum += 2;
			} else {
				status_sum += 1;
			}
			// state[1] = sync error (usec)
			// state[1] <= 2.0 = green
			// state[1] <= 4.0 = yellow
			// state[1] > 4.0 = red
			if (syncstate[1] <= 2.0) {
				status_sum += 10;
			} else if (syncstate[1] <= 4.0) {
				status_sum += 5;
			} else {
				status_sum += 0;
			}
			// state[2] = PPM offset
			// <= 50  = green
			// <= 180 = yellow
			//  > 180 = red
			ppm = Math.abs(syncstate[2]);
			if (ppm <= 50.0) {
				status_sum += 2;
			} else if (ppm <= 180.0) {
				status_sum += 1;
			} else {
				status_sum += 0;
			}
		}
		var status_avg = 0;
		// This is out of 10+2+2 (14) max, so fudge count by 1.4
		if (rec_peers.length > 0) {
			status_avg = status_sum / (rec_peers.length * 1.4);
		}
		var percent = status_avg * 10;
		percent = percent.toFixed(1);

		overall_record[i] = percent;
		overall_record_r[receivers[i]] = percent;
	}


	var table_thead = document.createElement('thead');
        var table_tr = document.createElement('tr');
        var table_th = document.createElement('th');

        table_th.innerHTML = "Receiver Name (" + receivers.length + " total)";
	table_th.className = "rec_name_header rec_name_td";
        table_tr.appendChild(table_th);        

        var table_th = document.createElement('th');
        table_th.innerHTML = "Health";
	table_th.className = "peer_count_header peer_count_td string-min";
        table_tr.appendChild(table_th);        

        var table_th = document.createElement('th');
        table_th.innerHTML = "Timeout";
	table_th.className = "peer_count_header peer_count_td string-min";
        table_tr.appendChild(table_th);        

        var table_th = document.createElement('th');
        table_th.innerHTML = "Peers";
	table_th.className = "peer_count_header peer_count_td";
        table_tr.appendChild(table_th);        

        var table_th = document.createElement('th');
	table_th.setAttribute("data-sorter", false);
        table_th.innerHTML = "Sync statuses";
        table_tr.appendChild(table_th);        

        table_thead.appendChild(table_tr);        

        table.appendChild(table_thead);
        
	var table_tbody = document.createElement('tbody');

        for (var i = 0; i < receivers.length; ++i) {

                var receiver_state = state[receivers[i]].peers;
		var rec_peers = Object.keys(receiver_state);
        	rec_peers.sort();

		var cellstring0 = "";
		var cellstring1 = "";
		var cellstring2 = "";
		var fudge = 0;
		for (var p = 0; p < rec_peers.length; ++p) {
			var syncstate = receiver_state[rec_peers[p]];
			var peer_status = overall_record_r[rec_peers[p]];
			//console.log("peer: " +receivers[i]+" <> "+ rec_peers[p] + " || status: " + peer_status);
			if (peer_status < 60) {
				fudge = 1;
			} else {
				fudge = 0;
			}

			cellstring0 += "<div id='sync-span' class='basicCircle";
			cellstring1 += "<div id='sync-span' class='basicCircle";
			cellstring2 += "<div id='sync-span' class='basicCircle";

			// 0 = sync count
			//  state[0] >= 10 = good (green), otherwise yellow
			if (syncstate[0] >= 10) {
				cellstring0 += " greenCircle'";
			} else {
				cellstring0 += " yellowCircle'";
			}
			cellstring0 += " title='"+rec_peers[p]+" : "+syncstate[0]+"'></div>";
			// state[1] = sync error (usec)
			// state[1] <= 2.0 = green
			// state[1] <= 4.0 = yellow
			// state[1] > 4.0 = red
			if (syncstate[1] <= 2.0) {
				cellstring1 += " greenCircle'";
			} else if (syncstate[1] <= 4.0) {
				cellstring1 += fudge ? " badCircle'" : " yellowCircle'";
			} else {
				cellstring1 += fudge ? " badCircle'" : " redCircle'";
			}
			cellstring1 += " title='"+rec_peers[p]+" : "+syncstate[1]+"'></div>";
			// state[2] = PPM offset
			// <= 50  = green
			// <= 180 = yellow
			//  > 180 = red
			ppm = Math.abs(syncstate[2]);
			if (ppm <= 50.0) {
				cellstring2 += " greenCircle'";
			} else if (ppm <= 180.0) {
				cellstring2 += fudge ? " badCircle'" : " yellowCircle'";
			} else {
				cellstring2 += fudge ? " badCircle'" : " redCircle'";
			}
			cellstring2 += " title='"+rec_peers[p]+" : "+syncstate[2]+"'></div>";
		}

		var bad_sync = (state[receivers[i]].bad_syncs != null) ? state[receivers[i]].bad_syncs : 0;
		percent = overall_record[i];
		percent = percent * ((6.0-bad_sync)/6.0);
		percent = percent.toFixed(1);
		var status_avg = percent ? (percent / 10) : 0;

		// Build the table
		var rowdata = document.createElement('tr');

		// Receiver
		var celldata_r = document.createElement('td');
		celldata_r.innerHTML = '<a href="/sync/feeder.html?'+my_region+'&'+encodeURIComponent(receivers[i])+'" class="rowlink">'+receivers[i]+'</a>';
		celldata_r.className = "rec_name_td";
		var status_class = "";
		if (status_avg > 9.5) {
			status_class = " sync_90";
		} else if (status_avg > 9) {
			status_class = " sync_80";
		} else if (status_avg > 8) {
			status_class = " sync_70";
		} else if (status_avg > 7) {
			status_class = " sync_60";
		} else if (status_avg > 6) {
			status_class = " sync_50";
		} else if (status_avg > 5) {
			status_class = " sync_40";
		} else if (status_avg > 4) {
			status_class = " sync_30";
		} else if (rec_peers.length <= 0) {
			status_class = " sync_nodata";
		} else {
			status_class = " sync_bad";
		}
		//celldata_r.className += status_class;
		//
		var score_class = "";

		if (bad_sync <= 0.001) {
			score_class = " sync_90";
		} else if (bad_sync <= 0.666) {
			score_class = " sync_70";
		} else {
			score_class = " sync_bad";
		}

		// Change into seconds - multiple by 150
		bad_sync = bad_sync * 150;
		bad_sync = bad_sync.toFixed(0);

		rowdata.appendChild(celldata_r);

		// Health
		var celldata_h = document.createElement('td');
		celldata_h.innerHTML = rec_peers.length > 0 ? percent + "%" : "N/A";
		celldata_h.className = "peer_text peer_count_td";
		celldata_h.className += status_class;
		rowdata.appendChild(celldata_h);

		// Bad Syncs
		var celldata_b = document.createElement('td');
		celldata_b.innerHTML = bad_sync + "s";
		celldata_b.className = "peer_text peer_count_td";
		celldata_b.className += score_class;
		rowdata.appendChild(celldata_b);

		// Peers
		var celldata_p = document.createElement('td');
		celldata_p.innerHTML = rec_peers.length;
		celldata_p.className = "peer_text peer_count_td";
		if (rec_peers.length <= 0) {
			celldata_p.className += " sync_nodata";
		}
		rowdata.appendChild(celldata_p);


		// Status
		var celldata_stat = document.createElement('td');
		celldata_stat.innerHTML = "";
		celldata_stat.className = "sync_text state";
		if (rec_peers.length > 0) {
			celldata_stat.innerHTML += cellstring0 + "(count)<br><div style='clear:both'></div>";
			celldata_stat.innerHTML += cellstring1 + "(&mu;sec err)<br><div style='clear:both'></div>";
			celldata_stat.innerHTML += cellstring2 + "(PPM offset)<div style='clear:both'></div>";
		} else {
			celldata_stat.innerHTML += "No synced peers";
			celldata_stat.className += " sync_nodata";
		}

		rowdata.appendChild(celldata_stat);
		table_tbody.appendChild(rowdata);

        }
	table.appendChild(table_tbody);
        
	setTimeout(search(), 10);
}

window.setInterval(refresh, 30000);

function findBaseName(url) {
	// Don't ask... the replace doesn't seem to alwyas want to work?
	url.replace(/\/$/, "");
	if (url.substr(-1) === '/') {
		url = url.substr(0, url.length - 1);
	}

	var last_index = url.lastIndexOf("/");
	var filename = url.substring(last_index+1);

	return filename;
}
