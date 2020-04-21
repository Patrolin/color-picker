// colorio.CAM16(0.69, 20, 12.8/math.pi)
// D65 = [95.047, 100, 108.883]
function modulo(a, b) {
	return ((a % b) + b) % b;
}
function sum(arr) {
	return arr.reduce((a, b) => a + b, 0);
}
function dot(a, b) {
	return a.map((x) => sum(x.map((y, i) => y * b[i])));
}
const CAM16 = {
	A_w: 25.518502081107826,
	D_RGB: [1.0208410446152913, 0.986525392997401, 0.935010326235023],
	F_L: 0.27313053667320736,
	H: [0.0, 100.0, 200.0, 300.0, 400.0],
	M16: [
		[0.401288, 0.650173, -0.051461],
		[-0.250268, 1.204414, 0.045854],
		[-0.002079, 0.048952, 0.953127],
	],
	M_: [
		[0.409651261111581, 0.6637232845006579, -0.05253350099694751],
		[-0.24689573705467355, 1.188184994681572, 0.04523613537050283],
		[-0.001943886468242613, 0.04577062548985685, 0.8911835872134087],
	],
	N_bb: 1.0003040045593807,
	N_c: 1.0,
	N_cb: 1.0003040045593807,
	c: 0.69,
	e: [0.8, 0.7, 1.0, 1.2, 0.8],
	h: [20.14, 90.0, 164.25, 237.53, 380.14],
	invM_: [
		[1.8240526915617519, -1.0250670055832494, 0.15955628644784864],
		[0.37961497069524497, 0.6299355762585144, -0.009597739100644789],
		[-0.015518085732244235, -0.0345890113632437, 1.1229442150716225],
	],
	n: 0.2,
	z: 1.9272135954999579,
};

function from_xyz100(xyz) {
	var { X, Y, Z } = xyz;
	if ([X, Y, Z].some((x) => x == undefined))
		throw TypeError('input is not XYZ');
	// Step 1: Calculate 'cone' responses
	// rgb = dot(self.M16, xyz)
	// Step 2: Complete the color adaptation of the illuminant in
	//         the corresponding cone response space
	// rgb_c = (rgb.T * self.D_RGB).T
	var rgb_ = dot(CAM16.M_, [X, Y, Z]);
	// Step 4: Calculate the post-adaptation cone response (resulting in dynamic range compression)
	function f(x) {
		var alpha =
			CAM16.F_L == Infinity
				? Infinity
				: ((Math.abs(x) * CAM16.F_L) / 100) ** 0.42;
		var beta = alpha ? 1 / (1 + 27.13 / alpha) : 0;
		return beta;
	}
	var rgb_a_ = rgb_.map((x) => Math.sign(x) * 400 * f(x));
	// Step 5: Calculate Redness-Greenness (a), Yellowness-Blueness (b) components and hue angle (h)
	// Step 7: Calculate achromatic response A
	var [a, b, p2_, u] = dot(
		[
			[1, -12 / 11, 1 / 11],
			[1 / 9, 1 / 9, -2 / 9],
			[2, 1, 1 / 20],
			[1, 1, 21 / 20],
		],
		rgb_a_
	);
	var h = modulo((180 / Math.PI) * Math.atan2(b, a), 360);
	var A = p2_ * CAM16.N_bb;
	if (A < 0) throw Error('CIECAM02 breakdown');
	// Step 6: Calculate eccentricity (e_t) and hue composition (H), using the unique hue data table.
	var h_ = modulo(h - CAM16.h[0], 360) + CAM16.h[0];
	var e_t = (Math.cos((Math.PI / 180) * h_ + 2) + 3.8) / 4;
	for (var i = 0; CAM16.h[i] <= h_; ++i) {}
	var beta = (h_ - CAM16.h[i - 1]) * CAM16.e[i];
	var H =
		CAM16.H[i - 1] +
		(100 * beta) / (beta + CAM16.e[i - 1] * (CAM16.h[i] - h_));
	// Step 8: Calculate the correlate of lightness
	var J = 100 * (A / CAM16.A_w) ** (CAM16.c * CAM16.z);
	// Step 9: Calculate the correlate of brightness
	var sqrt_J_100 = Math.sqrt(J / 100);
	var Q = (4 / CAM16.c) * sqrt_J_100 * (CAM16.A_w + 4) * CAM16.F_L ** 0.25;
	// Step 10: Calculate the correlates of chroma (C), colourfulness (M) and saturation (s)
	// Note the extra 0.305 here from the adaptation in rgb_a_ above.
	var p1_ = (50000 / 13) * e_t * CAM16.N_c * CAM16.N_cb;
	var t = (p1_ * Math.hypot(a, b)) / (u + 0.305);

	var alpha = t ** 0.9 * (1.64 - 0.29 ** CAM16.n) ** 0.73;
	var C = alpha * sqrt_J_100;

	var M = CAM16.F_L == Infinity ? 0 : C * CAM16.F_L ** 0.25;

	// ENH avoid division by Q=0 here.
	// s = 100 * Math.sqrt(M/Q)
	s = 50 * Math.sqrt((CAM16.c * alpha) / (CAM16.A_w + 4));

	return { J, C, H, h, M, s, Q };
}

function to_xyz100(data, description) {
	'Input: J or Q; C, M or s; H or h';
	var J, Q, C, M, s, H, h, alpha;
	if (description[0] == 'J') {
		J = data[0];
		// Q perhaps needed for C
		Q =
			(4 / CAM16.c) *
			Math.sqrt(J / 100) *
			(CAM16.A_w + 4) *
			CAM16.F_L ** 0.25;
	} else {
		// Step 1-1: Compute J from Q (if start from Q)
		//assert description[0] == "Q"
		Q = data[0];
		J = 6.25 * ((CAM16.c * Q) / (CAM16.A_w + 4) / CAM16.F_L ** 0.25) ** 2;
	}
	// Step 1-2: Calculate t from C, M, or s
	if (description[1] in ['C', 'M']) {
		if (description[1] == 'M') {
			M = data[1];
			C = M / CAM16.F_L ** 0.25;
		} else C = data[1];
		// If C or M is given and equal 0, the value of `t` cannot
		// algebraically deduced just by C or M. However, from other
		// considerations we know that it must be 0. Hence, allow division
		// by 0 and set nans to 0 afterwards.
		alpha = C / Math.sqrt(J / 100) || 0;
	} else {
		//assert description[1] == "s"
		s = data[1] / 100;
		C = (s * s * Q) / CAM16.F_L ** 0.25;
		alpha = (4 * s * s * (CAM16.A_w + 4)) / CAM16.c;
	}
	var t = (alpha / (1.64 - 0.29 ** CAM16.n) ** 0.73) ** (1 / 0.9);

	if (description[2] == 'h') h = data[2];
	else {
		//assert description[2] == "H"
		// Step 1-3: Calculate h from H (if start from H)
		H = data[2];
		for (var i = 0; CAM16.H[i] <= H; ++i) {}
		var Hi = CAM16.H[i - 1];
		var [hi, hi1] = [CAM16.h[i - 1], CAM16.h[i]];
		var [ei, ei1] = [CAM16.e[i - 1], CAM16.e[i]];
		var h_ =
			((H - Hi) * (ei1 * hi - ei * hi1) - 100 * hi * ei1) /
			((H - Hi) * (ei1 - ei) - 100 * ei1);
		h = modulo(h_, 360);
	}
	// Step 2: Calculate t, et , p1, p2 and p3
	var e_t = 0.25 * (Math.cos((h * Math.PI) / 180 + 2) + 3.8);
	var A = CAM16.A_w * (J / 100) ** (1 / CAM16.c / CAM16.z);

	// no 0.305
	var p2_ = A / CAM16.N_bb;

	// Step 3: Calculate a and b
	// ENH Much more straightforward computation of a, b
	var p1_ = ((e_t * 50000) / 13) * CAM16.N_c * CAM16.N_cb;
	var sinh = Math.sin((h * Math.PI) / 180);
	var cosh = Math.cos((h * Math.PI) / 180);
	var [a, b] = [cosh, sinh].map(
		(x) =>
			x *
			((23 * (p2_ + 0.305) * t) /
				(23 * p1_ + 11 * t * cosh + 108 * t * sinh))
	);

	// Step 4: Calculate RGB_a_
	var rgb_a_ = dot(
		[
			[460, 451, 288],
			[460, -891, -261],
			[460, -220, -6300],
		],
		[p2_, a, b]
	).map((x) => x / 1403);

	// Step 5: Calculate RGB_
	t = rgb_a_.map((r) =>
		CAM16.F_L == Infinity
			? 1.0
			: ((27.13 * Math.abs(r)) / (400 - Math.abs(r))) ** (1 / 0.42) /
			  CAM16.F_L
	);
	var rgb_ = Math.sign(rgb_a_) * 100 * t;
	// Step 6: Calculate R, G and B
	// rgb = (rgb_c.T / self.D_RGB).T
	// Step 7: Calculate X, Y and Z
	// xyz = self.solve_M16(rgb)
	return dot(CAM16.invM_, rgb_);
}
