# A ruined Doric temple on a cliff above the sea at dawn: the backdrop the launch page's glass
# console floats over (phase 9). Built from code in a fresh scene; render with export_temple().
import math
import os
import random

import bpy

rng = random.Random(9)


def reset():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def material(name, color, rough=0.6, emission=None, strength=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = [n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = strength
    return m


def link(obj):
    bpy.context.scene.collection.objects.link(obj)
    return obj


def mesh_obj(name, verts, faces, mat):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    o = bpy.data.objects.new(name, me)
    me.materials.append(mat)
    return link(o)


def column(name, x, y, height, radius, mat, tilt=0.0, broken=False, z0=0.0):
    """A fluted Doric shaft: 20 flutes, a slight taper, an echinus and abacus unless broken."""
    sides, rings = 40, 12
    verts, faces = [], []
    for r in range(rings + 1):
        z = height * r / rings
        taper = 1 - 0.14 * (r / rings)
        for s in range(sides):
            a = 2 * math.pi * s / sides
            flute = 1 - 0.05 * (0.5 + 0.5 * math.cos(a * 20))
            jag = rng.uniform(-0.12, 0.12) * radius if (broken and r == rings) else 0
            verts.append((radius * taper * flute * math.cos(a), radius * taper * flute * math.sin(a), z + jag))
    for r in range(rings):
        for s in range(sides):
            a, b = r * sides + s, r * sides + (s + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    faces.append(tuple(range(rings * sides, (rings + 1) * sides))[::-1])
    o = mesh_obj(name, verts, faces, mat)
    o.location = (x, y, z0)
    o.rotation_euler = (tilt, 0, rng.uniform(0, 6.28))
    if not broken:
        top = radius * 0.86
        bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=top * 1.25, depth=0.18, location=(x, y, z0 + height + 0.09))
        e = bpy.context.active_object
        e.data.materials.append(mat)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z0 + height + 0.27))
        ab = bpy.context.active_object
        ab.scale = (top * 2.8, top * 2.8, 0.18)
        ab.data.materials.append(mat)
    return o


def build():
    reset()
    sc = bpy.context.scene
    stone = material('TempleStone', (0.55, 0.52, 0.48), 0.8)
    rock = material('Cliff', (0.16, 0.13, 0.11), 0.9)
    sea = material('Sea', (0.01, 0.02, 0.03), 0.08)

    # the sea, far and flat
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 60, -6))
    s = bpy.context.active_object
    s.data.materials.append(sea)
    tex = bpy.data.textures.new('Waves', 'CLOUDS')
    tex.noise_scale = 0.6
    sub = s.modifiers.new('Sub', 'SUBSURF')
    sub.subdivision_type = 'SIMPLE'
    sub.levels = 6
    d = s.modifiers.new('Waves', 'DISPLACE')
    d.texture = tex
    d.strength = 0.25
    for poly in s.data.polygons:
        poly.use_smooth = True

    # the cliff the temple stands on
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 4, 0))
    c = bpy.context.active_object
    c.data.materials.append(rock)
    sub = c.modifiers.new('Sub', 'SUBSURF')
    sub.subdivision_type = 'SIMPLE'
    sub.levels = 6
    t2 = bpy.data.textures.new('Rock', 'CLOUDS')
    t2.noise_scale = 4.0
    d = c.modifiers.new('Rock', 'DISPLACE')
    d.texture = t2
    d.strength = 1.4
    for poly in c.data.polygons:
        poly.use_smooth = True

    # stylobate: three steps
    for i, (w, z) in enumerate(((13.0, 0.2), (12.2, 0.55), (11.4, 0.9))):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 6, z))
        st = bpy.context.active_object
        st.scale = (w, 4.6 - i * 0.4, 0.35)
        st.data.materials.append(stone)

    # the colonnade: some whole, some broken, one fallen
    xs = [-5.0, -3.0, -1.0, 1.0, 3.0, 5.0]
    heights = [5.2, 5.2, 3.1, 5.2, 1.6, 4.0]
    for i, (x, h) in enumerate(zip(xs, heights)):
        whole = h > 5
        column(f'Col{i}', x, 5.2, h, 0.48, stone, broken=not whole, z0=1.07)
    # the architrave still resting on the two whole columns on the left
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-4.0, 5.2, 1.07 + 5.2 + 0.72))
    ar = bpy.context.active_object
    ar.scale = (3.4, 1.1, 0.7)
    ar.data.materials.append(stone)
    fallen = column('Fallen', 2.6, 8.6, 3.6, 0.48, stone, tilt=math.pi / 2, broken=True)
    fallen.location = (1.4, 8.4, 0.95)
    fallen.rotation_euler = (math.pi / 2, 0, 0.35)
    for i in range(14):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rng.uniform(0.12, 0.35),
                                              location=(rng.uniform(-6, 6), rng.uniform(3.4, 9), 1.1))
        b = bpy.context.active_object
        b.data.materials.append(stone)
        b.scale = (1, rng.uniform(0.6, 1.4), rng.uniform(0.5, 0.9))

    # dawn: a sky from ember at the horizon to night at the zenith, driven by elevation
    w = sc.world or bpy.data.worlds.new('World')
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    coord = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(coord.outputs['Generated'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Fac'])
    els = ramp.color_ramp.elements
    els[0].position = 0.0
    els[0].color = (1.0, 0.42, 0.12, 1)
    els[1].position = 0.45
    els[1].color = (0.012, 0.016, 0.026, 1)
    for pos, col in ((0.04, (0.9, 0.3, 0.12, 1)), (0.12, (0.32, 0.14, 0.12, 1)), (0.24, (0.06, 0.07, 0.1, 1))):
        e = els.new(pos)
        e.color = col
    nt.links.new(ramp.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.6
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

    sun_d = bpy.data.lights.new('Sun', 'SUN')
    sun_d.energy = 6.0
    sun_d.color = (1.0, 0.62, 0.38)
    sun_d.angle = math.radians(3)
    sun = bpy.data.objects.new('Sun', sun_d)
    link(sun)
    sun.rotation_euler = (math.radians(84), 0, math.radians(180))
    fill_d = bpy.data.lights.new('Fill', 'SUN')
    fill_d.energy = 0.25
    fill_d.color = (0.4, 0.75, 0.8)
    fill = bpy.data.objects.new('Fill', fill_d)
    link(fill)
    fill.rotation_euler = (math.radians(60), 0, math.radians(20))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=5, location=(40, 160, 3))
    disc = bpy.context.active_object
    disc.data.materials.append(material('SunDisc', (1, 0.6, 0.3), emission=(1.0, 0.55, 0.25), strength=40))

    cam_d = bpy.data.cameras.new('Camera')
    cam_d.lens = 32
    cam = bpy.data.objects.new('Camera', cam_d)
    link(cam)
    cam.location = (-14.0, -12.0, 4.2)
    cam.rotation_euler = (math.radians(84), 0, math.radians(-38))
    sc.camera = cam

    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = 2400
    sc.render.resolution_y = 1350
    sc.view_settings.view_transform = 'AgX'
    try:
        sc.eevee.use_raytracing = True
    except Exception:
        pass


def export_temple(models_dir):
    sc = bpy.context.scene
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.quality = 82
    sc.render.filepath = os.path.join(models_dir, 'temple-dawn.webp')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    build()
