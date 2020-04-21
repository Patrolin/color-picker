from math import pi
from colorio import CAM16
from numpy import ndarray, dot
import numpy
from pprint import pprint

a = CAM16(0.69, 20, 12.8 / pi)
o = {}
for k in dir(a):
	if k in a.__dict__:
		v = a.__dict__[k]
		if isinstance(v, ndarray):
			v = v.tolist()
		o[k] = v
pprint(o)
print()
xyz = [95.047, 100, 108.883]
print(a.from_xyz100(xyz).tolist())
