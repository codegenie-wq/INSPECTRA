import os
import random
import math
from PIL import Image, ImageDraw, ImageFilter

os.makedirs('public/samples', exist_ok=True)

# 1. Defect-Free Cold Rolled Steel Sheet
def generate_defect_free():
    w, h = 800, 600
    img = Image.new('RGB', (w, h), (180, 185, 192))
    draw = ImageDraw.Draw(img)
    # Add brushed metal grain horizontally
    for y in range(h):
        val = int(180 + 20 * math.sin(y * 0.05) + random.randint(-10, 10))
        val = max(140, min(220, val))
        draw.line([(0, y), (w, y)], fill=(val, val + 2, val + 5))
    # Add subtle fine micro-lines
    for _ in range(400):
        y = random.randint(0, h)
        x1 = random.randint(0, w - 100)
        x2 = x1 + random.randint(50, 200)
        shade = random.randint(170, 210)
        draw.line([(x1, y), (x2, y)], fill=(shade, shade, shade + 2), width=1)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save('public/samples/defect_free_steel_sheet.jpg', quality=95)
    print("Generated defect_free_steel_sheet.jpg")

# 2. Defected: Steel Plate with Surface Crack
def generate_crack_defect():
    w, h = 800, 600
    img = Image.new('RGB', (w, h), (160, 165, 175))
    draw = ImageDraw.Draw(img)
    for y in range(h):
        val = int(160 + 15 * math.sin(y * 0.08) + random.randint(-8, 8))
        draw.line([(0, y), (w, y)], fill=(val, val, val + 3))
    # Draw dark jagged fissure/crack
    cur_x, cur_y = 200, 150
    points = [(cur_x, cur_y)]
    for _ in range(35):
        cur_x += random.randint(8, 20)
        cur_y += random.randint(4, 15)
        points.append((cur_x, cur_y))
        # Branch crack
        if random.random() < 0.25:
            bx, by = cur_x, cur_y
            branch = [(bx, by)]
            for _ in range(8):
                bx += random.randint(5, 15)
                by += random.randint(-10, 10)
                branch.append((bx, by))
            draw.line(branch, fill=(35, 30, 30), width=2)
    draw.line(points, fill=(20, 15, 15), width=4)
    # Bright stress shadow alongside crack
    draw.line([(p[0] + 2, p[1] + 1) for p in points], fill=(230, 230, 240), width=1)
    img = img.filter(ImageFilter.GaussianBlur(0.5))
    img.save('public/samples/steel_surface_longitudinal_crack.jpg', quality=95)
    print("Generated steel_surface_longitudinal_crack.jpg")

# 3. Defected: Pitted Corrosion and Deep Scratches
def generate_pitted_corrosion():
    w, h = 800, 600
    img = Image.new('RGB', (w, h), (145, 148, 155))
    draw = ImageDraw.Draw(img)
    for y in range(h):
        val = int(140 + 18 * math.sin(y * 0.04) + random.randint(-12, 12))
        draw.line([(0, y), (w, y)], fill=(val, val + 1, val + 4))
    # Severe abrasive scratch cluster
    for _ in range(12):
        x1 = random.randint(350, 450)
        y1 = random.randint(100, 250)
        x2 = x1 + random.randint(120, 250)
        y2 = y1 + random.randint(150, 280)
        draw.line([(x1, y1), (x2, y2)], fill=(40, 35, 35), width=random.randint(2, 4))
        draw.line([(x1+2, y1), (x2+2, y2)], fill=(225, 225, 230), width=1)
    # Rust pit clusters
    for _ in range(60):
        px = random.randint(150, 650)
        py = random.randint(250, 520)
        rad = random.randint(4, 18)
        draw.ellipse([px - rad, py - rad, px + rad, py + rad], fill=(120 + random.randint(-20, 20), 65 + random.randint(-15, 15), 35 + random.randint(-10, 10)))
        draw.ellipse([px - rad//2, py - rad//2, px + rad//2, py + rad//2], fill=(45, 25, 15))
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    img.save('public/samples/pitted_corrosion_plate.jpg', quality=95)
    print("Generated pitted_corrosion_plate.jpg")

# 4. Insufficient Image: Blurry & Extreme Low Light
def generate_insufficient():
    w, h = 800, 600
    img = Image.new('RGB', (w, h), (18, 19, 24))
    draw = ImageDraw.Draw(img)
    # Heavy blur blob
    draw.ellipse([200, 150, 600, 450], fill=(35, 38, 45))
    img = img.filter(ImageFilter.GaussianBlur(25.0))
    img.save('public/samples/insufficient_blur_lighting.jpg', quality=90)
    print("Generated insufficient_blur_lighting.jpg")

if __name__ == '__main__':
    generate_defect_free()
    generate_crack_defect()
    generate_pitted_corrosion()
    generate_insufficient()
