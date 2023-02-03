// SPDX-License-Identifier: MIT

$( document ).ready(function() {
	$.tablesorter.addParser({
		id: 'abs',
		is: function(s) { return false; },
		format: function(s) { return Math.abs(s); },
		type: 'numeric'
	});
	$("#feederpeertable").tablesorter({
		sortList: [[0,0]],
		headers: { 0: { sorter: "text" }, 3: { sorter: 'abs' }  },
		cssAsc: 'up',
		cssDesc: 'down',
		cssNone: 'unsort'
	});
	//$("#feederpeertable").tablesorter( { headers: { 3 : { sorter: 'abs' } } } );
	$( '#feederpeertable' ).trigger( 'updateHeaders');
	$( '#feederpeertable' ).trigger( 'update');
	$( '#feederpeertable' ).trigger( 'updateCache');
});

function doReload() {
	window.location.reload(true);
}

function doInit() {
	var param = window.location.search.substr(1);

	if (! param) {
		$('#feederstatstable > tbody:last-child').append('<tr class="t_err"><td>ERROR: missing region and feederID</td></tr>');
		return;
	}
	var params = param.split("&");
	// We're only ever going to look at the first 2 parameters.  Hacky, but whatever.
	if (params.length != 2) {
		if (params.length < 2) {
			$('#feederstatstable > tbody:last-child').append('<tr class="t_err"><td>ERROR: parameter error (too few)</td></tr>');
			return;
		} else {
			// This is not really an error
			//$('#feederstatstable > tbody:last-child').append('<tr class="t_err"><td>ERROR: parameter error (too many)</td></tr>');
		}
	}
	/*
	 * Param 0 = region
	 * Param 1 = feeder ID
	 */
	var region = params[0];
	var feeder = decodeURIComponent(params[1]);

	// Let's sanitize both of these, in case someone is trying to play games... 
	region = unescape(region).replace(/[^a-zA-Z0-9.-]/g, '');
	feeder = unescape(feeder).replace(/[\/<>\"\;\'\(\)]/g, '');	// Don't allow '/' or '<' or '>'
	feeder2 = unescape(feeder).replace(/[^a-zA-Z0-9._-]/g, '');	// feeder gets '_' as well

	// Just complain about bad names...
	if (feeder2 != feeder) {
		$('#feederstatstable > tbody:last-child').append('<tr class="t_err"><td colspan=2>WARNING: feeder name "'+feeder+'" has unsupported characters</td></tr>');
	}

	//console.log("region = " + region);
	//console.log("feeder = " + feeder);

	document.title = feeder + ' (R' + region + ') MLAT';
	$('#REGION').text(region);
	$('#NAME').text(feeder);
	var new_href = '/sync/' + region;
	$('#GOBACK').attr('href', new_href);
	//$( '#feederpeertable' ).trigger( 'updateHeaders');
	//$( '#feederpeertable' ).trigger( 'update');
	//$( '#feederpeertable' ).trigger( 'updateCache');

	// Ok, now we ajax call the json for the config, and then process it to see if this was actually a valid region number...
	
        var getconf = $.ajax({ url: '/sync/mirror_regions.json',
                                        timeout: 3000,
                                        cache: true,
                                        dataType: 'json' });
        getconf.done(function(data) {

		// Since the top level of this JSON is the ordered sequence for the data, we need to actually walk it to see if this region is valid, sigh
                var regionconf = Object.keys(data);
		var found_region = 0;

                for (var row = 0; row < regionconf.length; ++row) {

			var region_enabled = data[regionconf[row]].enabled;
			var region_num = data[regionconf[row]].region;
			if (region_num === region) {
				// But, is the region disabled?
				if (!region_enabled) {
					$('#feederstatstable > tbody:last-child').append('<tr class="t_err"><td>ERROR: Region '+region+' is disabled, sorry</td></tr>');
					return;
				}
				found_region = 1;
				break;
			}
		}
		if (!found_region) {
			$('#feederstatstable > tbody:last-child').append('<tr class="t_err"><td>ERROR: Invalid region "'+region+'"</td></tr>');
			return;
                }
		// We have a config, let's load the next thing
		loadData(region, feeder);
        });
	getconf.fail(function(jqxhr, status, error) {
		var e;
		e  = '<tr class="t_err"><td>';
		e += 'Fatal: Unable to load config, AJAX call failed';
		e += '</td></tr>';
		$("#feederstatstable > tbody:last-child").append(e);
		e  = '<tr class="t_err"><td>';
		e += 'Error: ' + status + (error ? (": " + error) : "");
		e += '</td></tr>';
		$("#feederstatstable > tbody:last-child").append(e);
		return;
	});


}

function loadData(region, feeder) {
	var dataurl = '/sync/' + region + '/sync.json';
	var loaddata = $.ajax({ url: dataurl,
                                        timeout: 3000,
                                        cache: false,
                                        dataType: 'json' });
	loaddata.done( function(data) {
		// Find our entry, then display the data all pretty-like
		if (!data[feeder]) {
			$("#feederstatstable > tbody:last-child").append('<tr class="t_err"><td>OOPS: Can\'t find myself ('+feeder+') in JSON table?</td></tr>');
			return;
		}
		var peers_ref = data[feeder].peers;
		var peers = Object.keys(peers_ref);
		peers.sort();
		var peer_count = peers.length;
		var bad_sync = data[feeder].bad_syncs;
		var clr_score;
		// console.log(peer_count);
		$("#feederstatstable > tbody:last-child").append('<tr><td>Feeder Name:</td><td class="statstext">'+feeder+'</td></tr>');
		$("#feederstatstable > tbody:last-child").append('<tr><td>Feeder Region:</td><td class="statstext">'+region+'</td></tr>');
		$("#feederstatstable > tbody:last-child").append('<tr><td>Feeder Peer Count:</td><td class="statstext">'+peer_count+'</td></tr>');

		clr_score = badsyncColor(bad_sync);
		if (bad_sync) {
			// Change into seconds
			bad_sync = bad_sync * 150;
			bad_sync = bad_sync.toFixed(0);
		} else {
			bad_sync = "0";
		}
		$("#feederstatstable > tbody:last-child").append('<tr><td>Feeder Timeout Penalty:</td><td class="statstext '+clr_score+'">'+bad_sync+'s</td></tr>');

		// First some headers for the table...
		$('#feederpeertable thead').append('<tr></tr>');
		$('#feederpeertable thead tr').append('<th>Peer Name</th>');
		$('#feederpeertable thead tr').append('<th>Timeout</th>');
		$('#feederpeertable thead tr').append('<th>Sync Count</th>');
		$('#feederpeertable thead tr').append('<th>Sync Err (μs)</th>');
		$('#feederpeertable thead tr').append('<th>PPM Offset</th>');
		$('#feederpeertable thead tr').append('<th>Outlier percentage</th>');

		if (peer_count == 0) {
			$('#feederpeertable > tbody:last-child').append('<tr class="t_err"><td>Sorry, no peers...</td></td>');
		}


		var peer_name, peer_sync_count, peer_sync_err, peer_ppm_offset, r;

		var cellcolor;

		var table_tr;
		var td_peer, td_count, td_err, td_ppm;
		var clr_count, clr_err, clr_ppm;

		// Ok, now iterate across all peers...
		for (var i = 0; i < peer_count; ++i) {

			peer_name = peers[i];
			peer_name = unescape(peer_name).replace(/[\/<>\"\;\'\(\)]/g, '');	// Don't allow '/' or '<' or '>'

			peer_sync_count	= peers_ref[peer_name][0];
			peer_sync_err	= peers_ref[peer_name][1];
			peer_ppm_offset	= peers_ref[peer_name][2];
			peer_score	= peers_ref[peer_name][3];
			peer_outlier_percent	= peers_ref[peer_name][5];
			if (peer_score) {
				// Change into seconds
				peer_score = peer_score * 150;
				peer_score = peer_score.toFixed(0);
			} else {
				peer_score = "0";
			}

			table_tr = document.createElement('tr');
			td_peer  = document.createElement('td');
			td_score = document.createElement('td');
			td_count = document.createElement('td');
			td_err   = document.createElement('td');
			td_ppm   = document.createElement('td');
			td_outlier   = document.createElement('td');

			td_peer.innerHTML  = '<a href="?'+region+'&'+peer_name+'" class="rowlink">'+peer_name+'</a>';
			td_score.innerHTML = peer_score+"s";
			td_count.innerHTML = peer_sync_count;
			td_err.innerHTML   = peer_sync_err;
			td_ppm.innerHTML   = peer_ppm_offset;
			td_outlier.innerHTML   = peer_outlier_percent;

			td_count.className = "count";
			td_score.className = "count";
			td_err.className = "count";
			td_ppm.className = "count";
			td_outlier.className = "count";

			clr_count = peerCountColor(peer_sync_count);
			clr_err = peerErrorColor(peer_sync_err);
			clr_ppm = peerPPMColor(Math.abs(peer_ppm_offset));
			clr_score = badsyncColor(peer_score);
			clr_outlier = outlierColor(peer_outlier_percent);

			td_count.className += " " + clr_count;
			td_score.className += " " + clr_score;
			td_err.className += " " + clr_err;
			td_ppm.className += " " + clr_ppm;
			td_outlier.className += " " + clr_outlier;

			table_tr.appendChild(td_peer);
			table_tr.appendChild(td_score);
			table_tr.appendChild(td_count);
			table_tr.appendChild(td_err);
			table_tr.appendChild(td_ppm);
			table_tr.appendChild(td_outlier);

			$('#feederpeertable tbody').append(table_tr);
			
			$( '#feederpeertable' ).data('tablesorter').sortList = [[0,0]];
			$( '#feederpeertable' ).trigger( 'updateHeaders');
			$( '#feederpeertable' ).trigger( 'update');
			$( '#feederpeertable' ).trigger( 'updateCache');
		}
	});
	loaddata.fail(function(jqxhr, status, error) {
		var e;
		e  = '<tr class="t_err"><td>';
		e += 'Fatal: Unable to load data, AJAX call failed';
		e += '</td></tr>';
		$("#feederstatstable > tbody:last-child").append(e);
		e  = '<tr class="t_err"><td>';
		e += 'Error: ' + status + (error ? (": " + error) : "");
		e += '</td></tr>';
		$("#feederstatstable > tbody:last-child").append(e);
		return;
	});
	window.setInterval(doReload, 30000);
}
