# Janus bifrons head as a signed distance field -> OpenVDB -> mesh, inside Blender.
# Z up; the old bearded face looks to -X, the young face to +X; the viewer stands on -Y.
import math, os, random
import numpy as np
import bpy, openvdb

OUT = bpy.app.tempdir  # the VDB is an intermediate file; only the mesh matters
V = 0.012
X0, X1, Y0, Y1, Z0, Z1 = -1.3, 1.3, -1.0, 1.0, -1.45, 1.2
xs = np.arange(X0, X1, V, dtype=np.float32)
ys = np.arange(Y0, Y1, V, dtype=np.float32)
zs = np.arange(Z0, Z1, V, dtype=np.float32)
GX, GY, GZ = np.meshgrid(xs, ys, zs, indexing='ij')
D = np.full(GX.shape, 10.0, dtype=np.float32)
rng = random.Random(11)


def smin(a, b, k):
    h = np.clip(k - np.abs(a - b), 0, None) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


def box(c, r, k=0.1):
    """Index slices of the sub-box around centre c with half-extent r, plus the blend reach."""
    m = r + 1.5 * k + 0.03
    def sl(lo, v0, n, c):
        i0 = max(0, int((c - m - v0) / V)); i1 = min(n, int((c + m - v0) / V) + 2)
        return slice(i0, i1)
    return (sl(0, X0, len(xs), c[0]), sl(0, Y0, len(ys), c[1]), sl(0, Z0, len(zs), c[2]))


def ellipsoid(c, r, k=0.1, sub=False):
    s = box(c, max(r), k)
    px = (GX[s] - c[0]) / r[0]; py = (GY[s] - c[1]) / r[1]; pz = (GZ[s] - c[2]) / r[2]
    d = (np.sqrt(px * px + py * py + pz * pz) - 1.0) * min(r)
    D[s] = smax(D[s], -d, k) if sub else smin(D[s], d, k)


def sphere(c, r, k=0.03, sub=False):
    ellipsoid(c, (r, r, r), k, sub)


def capsule(a, b, r, k=0.08, sub=False):
    a = np.array(a, np.float32); b = np.array(b, np.float32)
    c = (a + b) / 2; s = box(c, np.linalg.norm(b - a) / 2 + r, k)
    pax = GX[s] - a[0]; pay = GY[s] - a[1]; paz = GZ[s] - a[2]
    ba = b - a; h = np.clip((pax * ba[0] + pay * ba[1] + paz * ba[2]) / ba.dot(ba), 0, 1)
    dx = pax - ba[0] * h; dy = pay - ba[1] * h; dz = paz - ba[2] * h
    d = np.sqrt(dx * dx + dy * dy + dz * dz) - r
    D[s] = smax(D[s], -d, k) if sub else smin(D[s], d, k)


def curl(p, n, rr, k=0.012):
    """A carved spiral lock on the surface at p with outward normal n."""
    n = np.array(n, float); n /= np.linalg.norm(n)
    a = np.cross(n, (0, 0, 1)) if abs(n[2]) < 0.9 else np.cross(n, (1, 0, 0))
    a /= np.linalg.norm(a); b = np.cross(n, a)
    ph = rng.uniform(0, 2 * math.pi)
    for i in range(11):
        tt = i / 10
        ang = ph + tt * 2 * math.pi * 1.4; R = rr * (1 - 0.85 * tt)
        q = np.array(p) + R * (math.cos(ang) * a + math.sin(ang) * b) + n * rr * 0.35 * (1 - tt)
        sphere(tuple(q), rr * 0.42 * (1 - 0.45 * tt), k)


def shell(c, r, n, rmin, rmax, cond, k=0.03, spiral=False):
    placed = 0
    while placed < n:
        u = rng.uniform(-1, 1); th = rng.uniform(0, 2 * math.pi); q = math.sqrt(1 - u * u)
        d = (q * math.cos(th), q * math.sin(th), u)
        if not cond(d):
            continue
        p = (c[0] + r[0] * d[0], c[1] + r[1] * d[1], c[2] + r[2] * d[2])
        if spiral:
            curl(p, (d[0] / r[0], d[1] / r[1], d[2] / r[2]), rng.uniform(rmin, rmax) * 1.3)
        else:
            sphere(p, rng.uniform(rmin, rmax), k)
        placed += 1


# ---- shared skull, ears and neck
ellipsoid((0, 0, 0.3), (0.74, 0.62, 0.78), 0.2)
for y in (0.6, -0.6):
    ellipsoid((0, y, 0.0), (0.1, 0.06, 0.17), 0.06)
capsule((0, 0, -0.55), (0, 0, -1.4), 0.34, 0.25)


def face(sx, old):
    X = lambda x: sx * x
    ellipsoid((X(0.48), 0, 0.42), (0.36, 0.5, 0.42), 0.2)                     # forehead
    capsule((X(0.74), -0.26, 0.21), (X(0.74), 0.26, 0.21), 0.085 if old else 0.07, 0.08)  # brow
    for y in (0.16, -0.16):
        sphere((X(0.84), y, 0.12), 0.06, 0.05, sub=True)                      # eye socket
        ellipsoid((X(0.73), y, 0.1), (0.07, 0.085, 0.06), 0.03)              # eyeball
        ellipsoid((X(0.765), y, 0.14), (0.055, 0.095, 0.028), 0.02)          # upper lid
        ellipsoid((X(0.76), y, 0.06), (0.045, 0.085, 0.02), 0.02)            # lower lid
        sphere((X(0.795), y, 0.1), 0.02, 0.006, sub=True)                     # drilled pupil
        ellipsoid((X(0.62), y * 1.5, -0.04), (0.2, 0.14, 0.14), 0.12)        # cheekbone
    capsule((X(0.79), 0, 0.17), (X(1.0), 0, -0.17), 0.06, 0.06)            # nose bridge to tip
    for y in (0.05, -0.05):
        ellipsoid((X(0.88), y, -0.17), (0.06, 0.045, 0.045), 0.04)           # nose wings
    ellipsoid((X(0.52), 0, -0.3), (0.36, 0.44, 0.36), 0.18)                  # lower face
    if old:
        for i in range(-7, 8):                                                # moustache
            y = i * 0.035
            sphere((X(0.88 - 1.4 * y * y), y, -0.3 - 1.0 * y * y), 0.045, 0.03)
        ellipsoid((X(0.58), 0, -0.72), (0.32, 0.36, 0.5), 0.15)               # beard mass
        shell((X(0.58), 0, -0.72), (0.32, 0.36, 0.5), 230, 0.04, 0.06,
              lambda d: sx * d[0] > -0.35 and d[2] < 0.7, spiral=True)                     # beard curls
        shell((X(0.6), 0, -0.4), (0.3, 0.4, 0.2), 60, 0.035, 0.05,
              lambda d: sx * d[0] > 0.1)                                      # cheek beard
    else:
        ellipsoid((X(0.85), 0, -0.32), (0.06, 0.12, 0.04), 0.03)              # upper lip
        ellipsoid((X(0.83), 0, -0.41), (0.055, 0.1, 0.04), 0.03)              # lower lip
        capsule((X(0.885), -0.09, -0.365), (X(0.885), 0.09, -0.365), 0.012, 0.01, sub=True)
        ellipsoid((X(0.74), 0, -0.55), (0.12, 0.14, 0.12), 0.08)              # chin
        ellipsoid((X(0.42), 0, -0.5), (0.34, 0.38, 0.26), 0.15)               # jaw


face(-1, True)
face(+1, False)

# ---- hair: curls over the crown and the back of both heads
shell((0, 0, 0.32), (0.72, 0.6, 0.74), 200, 0.085, 0.12, lambda d: d[2] > -0.25 and abs(d[0]) < (0.5 if d[2] < 0.3 else 0.82) and not (abs(d[1]) > 0.55 and math.hypot(0.72 * d[0] - 0.06, 0.32 + 0.74 * d[2] - 0.2) < 0.42), k=0.02)
shell((0, 0, 0.32), (0.76, 0.64, 0.78), 90, 0.05, 0.07, lambda d: d[2] > 0.25 and abs(d[0]) < 0.7 and not (abs(d[1]) > 0.55 and math.hypot(0.76 * d[0] - 0.06, 0.32 + 0.78 * d[2] - 0.2) < 0.42), k=0.015)
# fine curls inside the horn's crescent and down to the nape
shell((0, 0, 0.32), (0.74, 0.63, 0.76), 160, 0.035, 0.05, lambda d: abs(d[1]) > 0.45 and d[2] > -0.35 and abs(d[0]) < 0.45, k=0.012)
shell((0, 0, 0.32), (0.72, 0.6, 0.74), 60, 0.06, 0.09, lambda d: d[2] > -0.5 and d[2] < 0.1 and abs(d[0]) < 0.3, k=0.02)

# ---- ram horns: a crescent from the crown, over the ear, curling forward and down
for side in (1, -1):
    N = 90
    for i in range(N):
        t = i / (N - 1)
        ang = math.radians(80 + 250 * t); r = 0.48 * (1 - 0.55 * t)
        c = (0.06 + r * math.cos(ang), side * (0.58 + 0.12 * math.sin(math.pi * t)), 0.2 + r * math.sin(ang))
        rad = (0.035 + 0.075 * math.sin(math.pi * min(1, t * 1.5)) * (1 - 0.5 * t)) * (1 + 0.07 * math.sin(60 * t))
        sphere(c, rad, 0.015)

# ---- weathering: a little stone noise
noise = np.zeros_like(D)
for f, a in ((7.1, 0.0012),):
    ph = [rng.uniform(0, 6.3) for _ in range(3)]
    rot = GX * 0.8 + GY * 0.36 + GZ * 0.48
    noise += a * np.sin(f * (GX + 0.5 * np.sin(f * 0.37 * GZ + ph[0])) + ph[1]) * np.sin(f * 1.13 * (GZ + 0.4 * np.sin(f * 0.41 * rot + ph[2])))
D += noise.astype(np.float32)

# ---- field -> VDB -> mesh
band = 2 * V
field = np.clip(0.5 - D / (2 * band), 0, 1).astype(np.float32)
grid = openvdb.FloatGrid()
grid.copyFromArray(field, ijk=(0, 0, 0))
grid.transform = openvdb.createLinearTransform(voxelSize=V)
grid.name = 'density'
import time
path = os.path.join(OUT, 'janus_head_%d.vdb' % int(time.time()))
openvdb.write(path, grids=[grid])

col = bpy.data.collections.get('Janus')
if col is None:
    col = bpy.data.collections.new('Janus'); bpy.context.scene.collection.children.link(col)
for o in [o for o in bpy.data.objects if o.name == 'Cube']:
    bpy.data.objects.remove(o, do_unlink=True)
if 'Marble' not in bpy.data.materials:
    bpy.data.materials.new('Marble')
for n in ('JanusVol', 'JanusHead'):
    o = bpy.data.objects.get(n)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)
for old in [v for v in bpy.data.volumes if v.users == 0]:
    bpy.data.volumes.remove(old)
for old in [m for m in bpy.data.meshes if m.users == 0]:
    bpy.data.meshes.remove(old)
vol = bpy.data.volumes.new('JanusVol'); vol.filepath = path
vo = bpy.data.objects.new('JanusVol', vol); col.objects.link(vo)
vo.location = (X0, Y0, Z0); vo.hide_render = True; vo.hide_viewport = True
me = bpy.data.meshes.new('JanusHead'); ho = bpy.data.objects.new('JanusHead', me); col.objects.link(ho)
mod = ho.modifiers.new('VolToMesh', 'VOLUME_TO_MESH'); mod.object = vo; mod.threshold = 0.5
mod.resolution_mode = 'GRID'
sm = ho.modifiers.new('Smooth', 'SMOOTH'); sm.factor = 0.6; sm.iterations = 3
ho.data.materials.append(bpy.data.materials['Marble'])
for n in ('JanusMeta', 'HornL', 'HornR'):
    o = bpy.data.objects.get(n)
    if o:
        o.hide_render = True; o.hide_viewport = True
