# The same scanned bust as scan.py, reduced to a low-poly shell for the lathe's wireframe: a few
# thousand flat triangles whose edges read as a mesh at full screen height. No Draco, so the edges
# keep their exact vertices.
#   D:\blender.exe -b --python assets/janus/wire.py
import os

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
STL = os.path.join(HERE, 'scan', '1659-russian-museum-s-pb-two-faced-janus.stl')
MODELS = os.path.join(REPO, 'apps', 'web-console', 'public', 'models')
FACES = 5200

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.stl_import(filepath=STL)
bust = [o for o in bpy.data.objects if o.type == 'MESH'][0]
bust.name = 'JanusWire'

# Same frame as scan.py: centred on the vertical axis, base at z = 0, 2.6 units tall.
co = np.array([v.co[:] for v in bust.data.vertices])
mn, mx = co.min(0), co.max(0)
scale = 2.6 / (mx[2] - mn[2])
bust.data.transform(Matrix.Translation(Vector((-(mn[0] + mx[0]) / 2, -(mn[1] + mx[1]) / 2, -mn[2]))))
bust.scale = (scale, scale, scale)
bpy.context.view_layer.objects.active = bust
bust.select_set(True)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

dec = bust.modifiers.new('Dec', 'DECIMATE')
dec.ratio = min(1.0, FACES / len(bust.data.polygons))
bpy.ops.object.modifier_apply(modifier='Dec')
tri = bust.modifiers.new('Tri', 'TRIANGULATE')
bpy.ops.object.modifier_apply(modifier='Tri')
for p in bust.data.polygons:
    p.use_smooth = False

os.makedirs(MODELS, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(MODELS, 'janus-wire.glb'), export_format='GLB', use_selection=True,
    export_apply=True, export_texcoords=False, export_normals=False, export_materials='NONE',
    export_cameras=False, export_lights=False)
print('janus-wire:', len(bust.data.vertices), 'vertices,', len(bust.data.polygons), 'faces')
