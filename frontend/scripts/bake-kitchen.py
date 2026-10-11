"""
Bake the kitchen's lighting into UV atlases and export it to GLB; render the kitchen as an HDR environment.

The kitchen objects in smart_fridge_final.blend have no UV maps and use object-space / procedural
materials that glTF cannot carry. Real-time shading also cannot match Cycles' global illumination.
This script therefore:
  1. gives every kitchen object a UV map (Smart UV Project) and packs each group into one atlas,
  2. bakes the full Cycles DIFFUSE result (colour + direct + indirect light, fridge in place, doors
     closed) per group with the Metal GPU, denoises it, and saves it through the scene's view
     transform (AgX) so it matches the renders,
  3. replaces the materials with emissive "lightmap" materials (rendered unlit in the browser),
  4. exports KITCHEN + plant collections to GLB,
  5. renders an equirectangular HDR of the kitchen (fridge hidden) for the fridge's real-time
     reflections and ambient light.
The .blend is NOT saved; the source stays untouched.

usage:
  /Applications/Blender.app/Contents/MacOS/Blender -b blender/smart_fridge_final.blend \
      --python scripts/bake-kitchen.py -- <out.glb> <env.hdr> [bake-dir] [samples] [--env-only]
"""
import bpy, sys, os, math, time

args = sys.argv[sys.argv.index("--") + 1 :]
OUT_GLB = os.path.abspath(args[0])
OUT_HDR = os.path.abspath(args[1])
BAKE_DIR = os.path.abspath(args[2] if len(args) > 2 else os.path.join(os.path.dirname(OUT_GLB), "bake"))
SAMPLES = int(args[3]) if len(args) > 3 and args[3].isdigit() else 256
ENV_ONLY = "--env-only" in args
os.makedirs(BAKE_DIR, exist_ok=True)

scene = bpy.context.scene
scene.frame_set(1)  # doors closed
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
try:
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != "CPU"
    scene.cycles.device = "GPU"
    print("using Metal GPU")
except Exception as e:
    scene.cycles.device = "CPU"
    print("GPU unavailable, CPU bake:", e)
scene.cycles.samples = SAMPLES
scene.cycles.use_adaptive_sampling = True
scene.cycles.use_denoising = False  # bakes are denoised in the compositor below
scene.render.bake.use_clear = True
scene.render.bake.margin = 12

WALL_MATS = {"KMAT_Wall_PBR"}
FLOOR_MATS = {"KMAT_Oak_Floor_PBR", "KMAT_FloorBase"}
# Architecture and cabinetry share the big atlas; small decor gets its own; the Poly Haven plants keep
# their authored UVs and textures (they are lit in real time by the HDR environment instead).
CABINET_MATS = {"KMAT_Oak_Panel", "KMAT_Oak_Carcass", "KMAT_Tile_PBR", "KMAT_Counter_Quartz", "KMAT_Grout", "KMAT_Reveal", "KMAT_Toekick", "KMAT_Frame_Win"}
# KMAT_Handle (polished metal) is deliberately left out: a diffuse bake of a metal is black, so handles stay
# real-time PBR in the browser, lit by the HDR like the fridge steel.
DECOR_MATS = {"KMAT_Ceramic", "KMAT_Board", "KMAT_Orange", "MAT_Food_Apple_Green", "KMAT_Pot", "KMAT_Soil", "KMAT_Leaf"}

export_objs = []
for cn in ["KITCHEN", "potted_plant_02", "potted_plant_04"]:
    col = bpy.data.collections.get(cn)
    if col:
        export_objs += [o for o in col.all_objects if not o.hide_render]
meshes = [o for o in export_objs if o.type == "MESH"]

def materials_of(o):
    return {s.material.name for s in o.material_slots if s.material}

def select_only(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.hide_set(False)
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]

GROUPS = [
    ("kitchen_walls", 2048, [o for o in meshes if materials_of(o) & WALL_MATS]),
    ("kitchen_floor", 2048, [o for o in meshes if materials_of(o) & FLOOR_MATS]),
    ("kitchen_cabinets", 4096, [o for o in meshes if materials_of(o) & CABINET_MATS]),
    ("kitchen_decor", 1024, [o for o in meshes if materials_of(o) & DECOR_MATS]),
]
skipped = [o.name for o in meshes if not any(o in g[2] for g in GROUPS)]
print("kept real-time (own UVs/materials):", skipped)

def denoise_and_save(img, path):
    """Run the baked float image through the compositor Denoise node and save with the scene's view transform (AgX)."""
    try:
        tree = getattr(scene, "compositing_node_group", None)
        if tree is None:
            scene.use_nodes = True
            tree = scene.node_tree
        else:
            if tree is None or True:
                tree = bpy.data.node_groups.new("BakeDenoise", "CompositorNodeTree")
                scene.compositing_node_group = tree
        tree.nodes.clear()
        n_img = tree.nodes.new("CompositorNodeImage"); n_img.image = img
        n_dn = tree.nodes.new("CompositorNodeDenoise"); n_dn.use_hdr = True
        n_out = tree.nodes.new("CompositorNodeComposite")
        tree.links.new(n_img.outputs["Image"], n_dn.inputs["Image"])
        tree.links.new(n_dn.outputs["Image"], n_out.inputs["Image"])
        for vl in scene.view_layers:
            vl.use = False  # compositor only, no 3D render
        scene.render.resolution_x = img.size[0]
        scene.render.resolution_y = img.size[1]
        scene.render.resolution_percentage = 100
        scene.render.image_settings.file_format = "PNG"
        scene.render.image_settings.color_mode = "RGB"
        scene.render.image_settings.color_depth = "8"
        scene.render.image_settings.color_management = "FOLLOW_SCENE"
        scene.render.filepath = path
        scene.render.use_compositing = True
        bpy.ops.render.render(write_still=True)
        for vl in scene.view_layers:
            vl.use = True
        if hasattr(scene, "compositing_node_group"):
            scene.compositing_node_group = None
        else:
            scene.use_nodes = False
        return "denoised + AgX"
    except Exception as e:
        print("compositor denoise failed, saving undenoised:", e)
        for vl in scene.view_layers:
            vl.use = True
        img.save_render(path)
        return "AgX (no denoise)"

lit_images = {}
for group, size, objs in GROUPS:
    if not objs or ENV_ONLY:
        continue
    t0 = time.time()
    print(f"== {group}: {len(objs)} objects, {size}px, {SAMPLES} samples")
    select_only(objs)
    bpy.ops.object.make_single_user(type="SELECTED_OBJECTS", object=True, obdata=True)
    for o in objs:
        uv = o.data.uv_layers.new(name="Bake")
        o.data.uv_layers.active = uv
        uv.active_render = True
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.002, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(margin=0.003, rotate=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    mats = []
    for o in objs:
        for s in o.material_slots:
            if s.material and s.material not in mats:
                mats.append(s.material)
    img = bpy.data.images.new(f"{group}_lit", size, size, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Linear Rec.709"
    temp = []
    for m in mats:
        if not m.use_nodes:
            m.use_nodes = True
        node = m.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = img
        m.node_tree.nodes.active = node
        temp.append((m, node))
    select_only(objs)
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR", "DIRECT", "INDIRECT"}, use_selected_to_active=False, margin=12, use_clear=True)
    for m, node in temp:
        m.node_tree.nodes.remove(node)
    path = os.path.join(BAKE_DIR, f"{group}_lit.png")
    how = denoise_and_save(img, path)
    print(f"   baked in {time.time() - t0:.0f}s → {path} ({how})")
    # Reload the saved sRGB image for the export material.
    lit = bpy.data.images.load(path)
    lit.colorspace_settings.name = "sRGB"
    lit_images[group] = lit

    baked = bpy.data.materials.new(f"KBAKE_{group}")
    baked.use_nodes = True
    nt = baked.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = lit
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(baked)

# ---- Export GLB ----
if not ENV_ONLY:
    select_only([o for o in export_objs if o.type in ("MESH", "EMPTY")])
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format="GLB", use_selection=True, export_apply=True, export_animations=False, export_cameras=False, export_lights=False, export_image_format="AUTO", export_texcoords=True, export_normals=True, export_materials="EXPORT", export_yup=True)
    print("exported", OUT_GLB)

# ---- Environment panorama (fridge hidden) ----
# Cycles lights are invisible to camera rays, so the reflections the steel shows in the renders (big studio
# softboxes, the window light) would be missing from the HDR. Add a camera-only emissive plane per area light
# with matching size, orientation and radiance (E = P / (pi * A)) so the panorama records them.
emit_mat = bpy.data.materials.new("EnvLightProxy")
emit_mat.use_nodes = True
def inside_fridge(o):
    while o is not None:
        if o.name == "SmartFridge_Root":
            return True
        o = o.parent
    return False

# Fridge-interior lights are excluded: the fridge is hidden in the panorama and the web app lights its interior itself.
for light in [o for o in bpy.data.objects if o.type == "LIGHT" and o.data.type == "AREA" and not o.hide_render and not inside_fridge(o)]:
    size_x = light.data.size
    size_y = light.data.size_y if light.data.shape in ("RECTANGLE", "ELLIPSE") else light.data.size
    area = size_x * size_y
    radiance = light.data.energy / (math.pi * max(area, 1e-4))
    mat = emit_mat.copy()
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*light.data.color, 1.0)
    em.inputs["Strength"].default_value = radiance
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    mesh = bpy.data.meshes.new(f"EnvProxy_{light.name}")
    mesh.from_pydata([(-size_x / 2, -size_y / 2, 0), (size_x / 2, -size_y / 2, 0), (size_x / 2, size_y / 2, 0), (-size_x / 2, size_y / 2, 0)], [], [(0, 1, 2, 3)])
    mesh.materials.append(mat)
    proxy = bpy.data.objects.new(f"EnvProxy_{light.name}", mesh)
    proxy.matrix_world = light.matrix_world.copy()
    scene.collection.objects.link(proxy)
    # Only camera rays see the proxy; the real light keeps doing the lighting.
    proxy.visible_diffuse = False
    proxy.visible_glossy = False
    proxy.visible_transmission = False
    proxy.visible_volume_scatter = False
    proxy.visible_shadow = False
    print(f"   light proxy {light.name}: {size_x:.2f}x{size_y:.2f} m, radiance {radiance:.1f}")
t0 = time.time()
root = bpy.data.objects.get("SmartFridge_Root")
if root:
    def hide_tree(o):
        o.hide_render = True
        for c in o.children: hide_tree(c)
    hide_tree(root)
cam_data = bpy.data.cameras.new("EnvCam")
cam_data.type = "PANO"
try:
    cam_data.panorama_type = "EQUIRECTANGULAR"
except Exception:
    cam_data.cycles.panorama_type = "EQUIRECTANGULAR"
cam = bpy.data.objects.new("EnvCam", cam_data)
scene.collection.objects.link(cam)
cam.location = (0.0, -0.75, 1.0)
cam.rotation_euler = (math.radians(90), 0, 0)
scene.camera = cam
scene.use_nodes = False
scene.render.resolution_x = 1024
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.cycles.samples = 256
scene.cycles.use_denoising = True
scene.render.image_settings.file_format = "HDR"
scene.render.image_settings.color_mode = "RGB"
scene.render.image_settings.color_management = "OVERRIDE"
scene.render.image_settings.view_settings.view_transform = "Standard"
scene.render.image_settings.view_settings.look = "None"
scene.render.image_settings.view_settings.exposure = 0.0
scene.render.filepath = OUT_HDR
bpy.ops.render.render(write_still=True)
print(f"environment rendered in {time.time() - t0:.0f}s →", OUT_HDR)
