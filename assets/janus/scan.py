# The scanned Janus bust (Scan The World, State Russian Museum, CC BY-NC-SA 4.0) prepared for the
# launch page's lathe: centred, scaled, reduced, exported as a Draco GLB, and one still render per
# face for reduced motion. The raw STL is not in the repository (35 MB); see LICENCE.md here.
#   D:\blender.exe -b --python assets/janus/scan.py
import math
import os

import bpy
import numpy as np
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
STL = os.path.join(HERE, 'scan', '1659-russian-museum-s-pb-two-faced-janus.stl')
MODELS = os.path.join(REPO, 'apps', 'web-console', 'public', 'models')

EMBER = (1.0, 0.36, 0.08)
AURORA = (0.25, 0.85, 0.8)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.wm.stl_import(filepath=STL)
bust = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bust.name = 'JanusBust'

# Centre on the vertical axis through the head, base at z = 0, 2.6 units tall. The bearded face
# looks along +X, the young one along -X (as scanned).
co = np.array([v.co[:] for v in bust.data.vertices])
mn, mx = co.min(0), co.max(0)
scale = 2.6 / (mx[2] - mn[2])
bust.data.transform(
    __import__('mathutils').Matrix.Translation(Vector((-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2])))
)
bust.scale = (scale, scale, scale)
bpy.context.view_layer.objects.active = bust
bust.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

dec = bust.modifiers.new('Dec', 'DECIMATE')
dec.ratio = 0.17
bpy.ops.object.modifier_apply(modifier='Dec')
for p in bust.data.polygons:
    p.use_smooth = True

marble = bpy.data.materials.new('Marble')
marble.use_nodes = True
b = [n for n in marble.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]
b.inputs['Base Color'].default_value = (0.62, 0.6, 0.56, 1)
b.inputs['Roughness'].default_value = 0.5
bust.data.materials.append(marble)

os.makedirs(MODELS, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(MODELS, 'janus-bust.glb'), export_format='GLB', use_selection=True,
    export_apply=True, export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=7, export_draco_position_quantization=14,
    export_draco_normal_quantization=10, export_texcoords=False,
    export_cameras=False, export_lights=False)

# --- still renders: each face in three-quarter view, rim-lit in its team's colour
w = bpy.data.worlds.new('World')
sc.world = w
w.use_nodes = True
bg = [n for n in w.node_tree.nodes if n.type == 'BACKGROUND'][0]
bg.inputs['Color'].default_value = (0.004, 0.004, 0.004, 1)


def area(name, loc, color, energy, size, aim):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy, d.size, d.color = energy, size, color
    o = bpy.data.objects.new(name, d)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (Vector(aim) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o


cam_d = bpy.data.cameras.new('Cam')
cam_d.lens = 85
cam = bpy.data.objects.new('Cam', cam_d)
sc.collection.objects.link(cam)
sc.camera = cam
sc.render.engine = 'BLENDER_EEVEE'
sc.render.resolution_x = 1200
sc.render.resolution_y = 1500
sc.view_settings.view_transform = 'AgX'
sc.render.image_settings.file_format = 'WEBP'
sc.render.image_settings.quality = 85

target = Vector((0, 0, 1.75))
for face, sign, rim, name in ((+1, 1, EMBER, 'attack'), (-1, -1, AURORA, 'defense')):
    for o in [o for o in bpy.data.objects if o.type == 'LIGHT']:
        bpy.data.objects.remove(o, do_unlink=True)
    # the camera sits off the face's side, three-quarter on
    a = math.radians(35)
    cam.location = (sign * 7.5 * math.cos(a), -7.5 * math.sin(a), 1.9)
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    area('Key', (sign * 4.0, -3.0, 4.5), (1.0, 0.92, 0.85), 140, 2.0, target)
    area('Rim', (-sign * 1.0, 3.0, 3.4), rim, 2600, 0.8, target)
    area('Rim2', (sign * 3.2, 2.2, 1.2), rim, 1800, 0.8, target)
    area('Fill', (-sign * 3.0, -4.0, 1.0), rim, 60, 4.0, target)
    sc.render.filepath = os.path.join(MODELS, f'janus-{name}.webp')
    bpy.ops.render.render(write_still=True)

print('TRIS', sum(len(p.vertices) - 2 for p in bust.data.polygons))
print('GLB', os.path.getsize(os.path.join(MODELS, 'janus-bust.glb')))
