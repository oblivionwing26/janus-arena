# Export the Janus head for the web and render the two fallback images.
# Run after build_head.py and stage.py, from the repository root (Blender's working directory).
import math
import os

import bpy

ROOT = os.path.abspath(os.environ.get('JANUS_REPO', '.'))
MODELS = os.path.join(ROOT, 'apps', 'web-console', 'public', 'models')
os.makedirs(MODELS, exist_ok=True)
sc = bpy.context.scene

# ---- the mesh: modifiers applied, decimated to ~96k triangles, Draco-compressed GLB
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(bpy.data.objects['JanusHead'].evaluated_get(dg))
old = bpy.data.objects.get('JanusExport')
if old:
    bpy.data.objects.remove(old, do_unlink=True)
ex = bpy.data.objects.new('JanusExport', me)
bpy.data.collections['Janus'].objects.link(ex)
me.materials.clear(); me.materials.append(bpy.data.materials['Marble'])
dec = ex.modifiers.new('Dec', 'DECIMATE'); dec.ratio = 0.35
for o in bpy.context.view_layer.objects:
    o.select_set(False)
ex.select_set(True); bpy.context.view_layer.objects.active = ex
bpy.ops.object.modifier_apply(modifier='Dec')
bpy.ops.object.shade_smooth()
me.validate(clean_customdata=True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(MODELS, 'janus.glb'), export_format='GLB', use_selection=True,
    export_apply=True, export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7, export_draco_position_quantization=14,
    export_draco_normal_quantization=10, export_texcoords=False,
    export_cameras=False, export_lights=False)
ex.hide_render = True

# ---- the point cloud the web draws as particles: N points sampled by area on the surface,
# in three.js axes (glTF: x, z, -y). File: uint32 N, then N*3 int16 positions (metres / 1.5 *
# 32767), then N*3 int8 normals (* 127). Fixed seed, so the cloud is the same on every export.
import numpy as np
N = 40000
me.calc_loop_triangles()
tris = np.array([t.vertices[:] for t in me.loop_triangles], dtype=np.int64)
vco = np.array([v.co[:] for v in me.vertices], dtype=np.float64)
vno = np.array([v.normal[:] for v in me.vertices], dtype=np.float64)
a, b, c = vco[tris[:, 0]], vco[tris[:, 1]], vco[tris[:, 2]]
area = np.linalg.norm(np.cross(b - a, c - a), axis=1)
gen = np.random.default_rng(2026)
pick = gen.choice(len(tris), size=N, p=area / area.sum())
u, v = gen.random(N), gen.random(N)
flip = u + v > 1; u[flip], v[flip] = 1 - u[flip], 1 - v[flip]
w = 1 - u - v
t = tris[pick]
pos = vco[t[:, 0]] * w[:, None] + vco[t[:, 1]] * u[:, None] + vco[t[:, 2]] * v[:, None]
nor = vno[t[:, 0]] * w[:, None] + vno[t[:, 1]] * u[:, None] + vno[t[:, 2]] * v[:, None]
nor /= np.linalg.norm(nor, axis=1)[:, None]
to_three = lambda p: np.stack([p[:, 0], p[:, 2], -p[:, 1]], axis=1)
pos, nor = to_three(pos), to_three(nor)
with open(os.path.join(MODELS, 'janus-points.bin'), 'wb') as f:
    f.write(np.uint32(N).tobytes())
    f.write(np.clip(np.round(pos / 1.5 * 32767), -32767, 32767).astype('<i2').tobytes())
    f.write(np.clip(np.round(nor * 127), -127, 127).astype('i1').tobytes())

# ---- fallback renders: the coin view (both profiles) and a 3/4 view of the young face
sc.render.resolution_x = 1600; sc.render.resolution_y = 1000; sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'WEBP'; sc.render.image_settings.quality = 88
cam = bpy.data.objects['Camera']
for c in list(cam.constraints):
    cam.constraints.remove(c)
cam.location = (0, -8.2, 0.05); cam.rotation_euler = (math.pi / 2, 0, 0)
sc.render.filepath = os.path.join(MODELS, 'janus-fallback.webp')
bpy.ops.render.render(write_still=True)

aim = bpy.data.objects.get('CamAim') or bpy.data.objects.new('CamAim', None)
if aim.name not in bpy.data.collections['Janus'].objects:
    bpy.data.collections['Janus'].objects.link(aim)
aim.location = (0, 0, 0.05)
aurora, key = bpy.data.objects['RimAurora'].data, bpy.data.objects['Key'].data
aurora_e, key_e = aurora.energy, key.energy
aurora.energy, key.energy = 1300, 110
a = math.radians(38)
cam.location = (8.2 * math.sin(a), -8.2 * math.cos(a), 0.6)
c = cam.constraints.new('TRACK_TO'); c.target = aim; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
sc.render.filepath = os.path.join(MODELS, 'janus-fallback-alt.webp')
bpy.ops.render.render(write_still=True)
cam.constraints.remove(c); cam.location = (0, -8.2, 0.05); cam.rotation_euler = (math.pi / 2, 0, 0)
aurora.energy, key.energy = aurora_e, key_e
