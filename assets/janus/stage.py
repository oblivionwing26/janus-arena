# The epic stage around the head: halo of fire, two-colour rim light, pedestal, sparks, haze.
import math, random
import bpy

col = bpy.data.collections['Janus']
rng = random.Random(3)


def fresh(name):
    o = bpy.data.objects.get(name)
    if o:
        bpy.data.objects.remove(o, do_unlink=True)


def bsdf(mat):
    mat.use_nodes = True
    return [n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]


def emissive(name, rgb, strength):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    b = bsdf(m)
    b.inputs['Base Color'].default_value = (*rgb, 1)
    b.inputs['Emission Color'].default_value = (*rgb, 1)
    b.inputs['Emission Strength'].default_value = strength
    return m


# marble
m = bpy.data.materials['Marble']; b = bsdf(m)
b.inputs['Base Color'].default_value = (0.62, 0.58, 0.53, 1)
b.inputs['Roughness'].default_value = 0.55
b.inputs['Subsurface Weight'].default_value = 0.08
b.inputs['Subsurface Radius'].default_value = (0.3, 0.2, 0.15)

EMBER = (1.0, 0.36, 0.08)
AURORA = (0.25, 0.85, 0.8)

# halo of fire behind the head (the viewer is on -Y)
fresh('Halo')
bpy.ops.mesh.primitive_torus_add(major_radius=1.3, minor_radius=0.022, major_segments=160, minor_segments=12,
                                 location=(0, 0.75, 0.28), rotation=(math.pi / 2, 0, 0))
h = bpy.context.active_object; h.name = 'Halo'
for c in h.users_collection: c.objects.unlink(h)
col.objects.link(h)
h.data.materials.clear(); h.data.materials.append(emissive('HaloFire', (1.0, 0.22, 0.03), 14))

# broken stone pedestal
fresh('Pedestal')
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.52, depth=0.32, location=(0, 0, -1.6))
p = bpy.context.active_object; p.name = 'Pedestal'
for c in p.users_collection: c.objects.unlink(p)
col.objects.link(p)
p.data.materials.clear(); p.data.materials.append(m)
bev = p.modifiers.new('Bevel', 'BEVEL'); bev.width = 0.02; bev.segments = 2

# sparks rising
for o in [o for o in col.objects if o.name.startswith('Spark')]:
    bpy.data.objects.remove(o, do_unlink=True)
spark_mat = emissive('Spark', (1.0, 0.45, 0.12), 25)
spark_mesh = bpy.data.meshes.get('SparkMesh')
if spark_mesh is None:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=1)
    tmp = bpy.context.active_object; spark_mesh = tmp.data; spark_mesh.name = 'SparkMesh'
    bpy.data.objects.remove(tmp, do_unlink=True)
spark_mesh.materials.clear(); spark_mesh.materials.append(spark_mat)
for i in range(70):
    s = bpy.data.objects.new('Spark%02d' % i, spark_mesh); col.objects.link(s)
    s.location = (rng.uniform(-2.4, 2.4), rng.uniform(-0.6, 1.6), rng.uniform(-1.8, 1.9))
    s.scale = [rng.uniform(0.004, 0.012)] * 3

# lights: soft warm key from the front, and one rim per face
for n in ('Light', 'RimEmber', 'RimAurora', 'Key'):
    fresh(n)
def area(name, loc, rot, rgb, energy, size):
    d = bpy.data.lights.new(name, 'AREA'); d.energy = energy; d.size = size; d.color = rgb
    o = bpy.data.objects.new(name, d); col.objects.link(o); o.location = loc; o.rotation_euler = rot
    return o
area('Key', (0.6, -3.2, 3.6), (math.radians(40), 0, math.radians(8)), (1.0, 0.9, 0.8), 60, 3.0)
# each rim sits behind its face and aims at it
for name, sx, rgb, energy in (('RimEmber', -1, EMBER, 4500), ('RimAurora', 1, AURORA, 3800)):
    o = area(name, (sx * 1.9, 1.3, 0.7), (0, 0, 0), rgb, energy, 0.7)
    fresh('Aim' + name)
    aim = bpy.data.objects.new('Aim' + name, None); col.objects.link(aim); aim.location = (sx * 0.85, 0, 0)
    c = o.constraints.new('TRACK_TO'); c.target = aim; c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'

# world: near black, no haze (lit haze shows the lamps as panels)
sc = bpy.context.scene
w = sc.world; w.use_nodes = True; nt = w.node_tree
bg = [n for n in nt.nodes if n.type == 'BACKGROUND'][0]
bg.inputs['Color'].default_value = (0.006, 0.005, 0.004, 1)
out = [n for n in nt.nodes if n.type == 'OUTPUT_WORLD'][0]
for link in list(out.inputs['Volume'].links):
    nt.links.remove(link)

# camera: the coin view, both profiles; 16:10 frame
cam = bpy.data.objects['Camera']
cam.location = (0, -8.2, 0.05); cam.rotation_euler = (math.pi / 2, 0, 0); cam.data.lens = 50
sc.render.resolution_x = 1600; sc.render.resolution_y = 1000
sc.view_settings.view_transform = 'AgX'
sc.view_settings.look = 'AgX - Punchy' if 'AgX - Punchy' in [i.identifier for i in sc.view_settings.bl_rna.properties['look'].enum_items_static] else 'None'
try:
    sc.eevee.use_raytracing = True
    sc.eevee.volumetric_tile_size = '4'
except Exception:
    pass

# bloom through the compositor (Glare, fog glow)
try:
    ng = sc.compositing_node_group
    if ng is None:
        ng = bpy.data.node_groups.new('JanusComp', 'CompositorNodeTree'); sc.compositing_node_group = ng
    ng.nodes.clear()
    rl = ng.nodes.new('CompositorNodeRLayers')
    gl = ng.nodes.new('CompositorNodeGlare')
    for k, v in (('glare_type', 'FOG_GLOW'), ('quality', 'HIGH')):
        try: setattr(gl, k, v)
        except Exception: pass
    for k, v in (('Type', 'Fog Glow'), ('Threshold', 1.0), ('Strength', 0.6), ('Size', 0.7)):
        if k in gl.inputs:
            try: gl.inputs[k].default_value = v
            except Exception: pass
    go = ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    o = ng.nodes.new('NodeGroupOutput')
    ng.links.new(rl.outputs['Image'], gl.inputs['Image'])
    ng.links.new(gl.outputs['Image'], o.inputs[0])
    comp = 'ok'
except Exception as e:
    comp = str(e)[:200]
