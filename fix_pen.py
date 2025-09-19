import bpy
import math

# Desired length for all pens (in Blender units: 1 = 1m, so 0.15 = 15cm)
TARGET_LENGTH = 0.15  

# Function to align one object
def fix_pen(obj):
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    
    # Go to edit mode
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')

    # Assume pen tip is at lowest Z vertex
    bpy.ops.view3d.snap_cursor_to_selected()
    bpy.ops.object.mode_set(mode='OBJECT')

    # Set origin to cursor (pen tip)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR', center='MEDIAN')

    # Scale pen to match target length
    dims = obj.dimensions
    max_dim = max(dims.x, dims.y, dims.z)
    scale_factor = TARGET_LENGTH / max_dim
    obj.scale *= scale_factor

    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

# Run on all selected objects
for obj in bpy.context.selected_objects:
    if obj.type == 'MESH':
        fix_pen(obj)

print("✅ All selected pens fixed: origin at tip + same size")
