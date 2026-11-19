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
