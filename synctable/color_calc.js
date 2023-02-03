// SPDX-License-Identifier: MIT

/*
 * These all return either:
 *  2 = GREEN
 *  1 = YELLOW
 *  0 = RED
 */
function peerCountColor(count) {
	if (count > 10) {
		return "green";
	} else {
		return "yellow";
	}
}

function peerErrorColor(err) {
	if (err <= 2.0) {
		return "green";
	} else if (err <= 4.0) {
		return "yellow";
	} else {
		return "red";
	}
}

function peerPPMColor(ppm) {
	if (ppm <= 50.0) {
		return "green";
	} else if (ppm <= 180.0) {
		return "yellow";
	} else {
		return "red";
	}
}


function badsyncColor(num) {
	if (num <= 0.001) {
		return "green";
	} else if (num <= 0.75) {
		return "yellow";
	} else {
		return "red";
	}
}


function outlierColor(num) {
	if (num <= 30) {
		return "green";
	} else if (num <= 40) {
		return "yellow";
	} else {
		return "red";
	}
}
