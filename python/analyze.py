#!/usr/bin/env python3
"""
ScalpAI Offline Analyzer
Analyzes scalp images locally using OpenCV heuristics.
Outputs JSON to stdout.

نکته: این فرمول‌ها عمداً دقیقاً هم‌تراز با src/lib/scalpFeatures.ts (موتور
مرورگر) نگه داشته می‌شوند — تا در نسخهٔ دسکتاپ (Electron)، صرف‌نظر از این‌که
موتور Python یا موتور مرورگر اجرا شود، دقیقاً همان مجموعهٔ کامل شاخص‌ها با
همان مقادیر دیده شود.

ضرایب و آستانه‌ها دیگر اینجا هاردکد نیستند: از shared/scalp-constants.json
خوانده می‌شوند که همان منبعی است که src/lib/heuristicConstants.ts استفاده
می‌کند. قبلاً این اعداد در دو فایل جدا تکرار شده بودند و اگر یکی تغییر
می‌کرد، همان تصویر با موتور Python و موتور مرورگر نتیجهٔ متفاوت می‌داد —
بی‌صدا، چون fallback بین دو موتور خودکار است.
اسکریپت scripts/check-shared-constants.cjs همگام بودن را در CI بررسی می‌کند.
"""

import sys
import json
import base64
import io
import os

try:
    import cv2
    import numpy as np
except ImportError:
    print(json.dumps({"error": "Missing dependencies. Run: pip install opencv-python numpy matplotlib"}))
    sys.exit(1)

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    HAS_MPL = True
except ImportError:
    HAS_MPL = False

def _load_shared_constants():
    """
    ثابت‌های مشترک با موتور مرورگر.
    در حالت توسعه کنار پوشهٔ python است؛ در نسخهٔ بسته‌بندی‌شده در
    resources/shared قرار می‌گیرد (به extraResources در electron-builder.json
    اضافه شده). اگر پیدا نشد، مقادیر پیش‌فرض استفاده می‌شوند تا تحلیل
    آفلاین کاملاً از کار نیفتد.
    """
    here = os.path.dirname(os.path.abspath(__file__))
    for candidate in (
        os.path.join(here, '..', 'shared', 'scalp-constants.json'),
        os.path.join(here, '..', 'resources', 'shared', 'scalp-constants.json'),
        os.path.join(here, 'scalp-constants.json'),
    ):
        try:
            with open(os.path.normpath(candidate), encoding='utf-8') as fh:
                return json.load(fh)
        except (OSError, ValueError):
            continue
    return {
        'GRID_SIZE': 4,
        'FEATURE_SCALE': {
            'dandruffFromWhiteFlake': 400, 'rednessFromRatio': 350,
            'oilinessTextureDivisor': 80, 'drynessBrightnessBase': 180,
            'drynessBrightnessDivisor': 1.8, 'densityFromCoverage': 180,
            'shineFromRatio': 600, 'patchinessFromRaw': 300,
            'pigmentationFromRaw': 2.2, 'hairThicknessEdgeFactor': 40,
            'minHairArea': 0.04,
        },
    }


_CONSTANTS = _load_shared_constants()
GRID_SIZE = _CONSTANTS['GRID_SIZE']
SCALE = _CONSTANTS['FEATURE_SCALE']


def analyze(image_path: str, lang: str = 'fa') -> dict:
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    h, w = img.shape[:2]
    max_dim = 640
    scale = min(1.0, max_dim / max(h, w))
    if scale < 1.0:
        img = cv2.resize(img, (int(w * scale), int(h * scale)))
        h, w = img.shape[:2]

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    brightness = float(np.mean(gray))
    b, g, r = cv2.split(img)
    rf, gf, bf = r.astype(np.float32), g.astype(np.float32), b.astype(np.float32)

    red_mask = (rf > gf + 25) & (rf > bf + 25) & (r > 100)
    redness_ratio = float(np.mean(red_mask))

    white_mask = (gray > 200) & (r > 180) & (g > 180) & (b > 180)
    white_flake_ratio = float(np.mean(white_mask))

    # براقی/سبوره: نقاط خیلی روشن و تقریباً بی‌رنگ (بازتاب نور مستقیم)،
    # آستانه‌ای بالاتر و سخت‌گیرانه‌تر از شوره تا با پوسته‌های مات اشتباه نشود
    max_channel_diff = np.maximum(np.maximum(np.abs(rf - gf), np.abs(gf - bf)), np.abs(rf - bf))
    shine_mask = (gray > 245) & (max_channel_diff < 12)
    shine_ratio = float(np.mean(shine_mask))

    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    grad_magnitude = np.abs(laplacian)
    texture_variance = float(np.var(laplacian))
    edge_density = float(np.mean(grad_magnitude > 30))

    dark_mask = gray < 60
    hair_coverage = float(np.mean(dark_mask))

    # شاخص‌های ناحیه‌ای (شبکهٔ GRID_SIZE x GRID_SIZE): لکه‌ای بودن پوشش مو و
    # ناهمگونی رنگدانه/روشنایی بین نواحی مختلف تصویر
    cell_h = max(1, h // GRID_SIZE)
    cell_w = max(1, w // GRID_SIZE)
    cell_coverages = []
    cell_brightnesses = []
    for gy in range(GRID_SIZE):
        for gx in range(GRID_SIZE):
            y0, y1 = gy * cell_h, min(h, (gy + 1) * cell_h) if gy < GRID_SIZE - 1 else h
            x0, x1 = gx * cell_w, min(w, (gx + 1) * cell_w) if gx < GRID_SIZE - 1 else w
            if y1 <= y0 or x1 <= x0:
                continue
            cell_gray = gray[y0:y1, x0:x1]
            if cell_gray.size == 0:
                continue
            cell_coverages.append(float(np.mean(cell_gray < 60)))
            cell_brightnesses.append(float(np.mean(cell_gray)))

    patchiness_raw = float(np.std(cell_coverages)) if len(cell_coverages) > 1 else 0.0
    pigmentation_raw = float(np.std(cell_brightnesses)) if len(cell_brightnesses) > 1 else 0.0

    def clamp_score(v, scale=100):
        return int(max(0, min(100, round(v * scale))))

    # همهٔ ضرایب از shared/scalp-constants.json — با موتور مرورگر یکسان
    dandruff_score = clamp_score(white_flake_ratio, SCALE['dandruffFromWhiteFlake'])
    redness_score = clamp_score(redness_ratio, SCALE['rednessFromRatio'])
    oiliness_score = clamp_score(texture_variance / SCALE['oilinessTextureDivisor'], 100)
    dryness_score = int(max(0, min(100, round(
        (SCALE['drynessBrightnessBase'] - brightness) / SCALE['drynessBrightnessDivisor']
    ))))
    density_score = clamp_score(hair_coverage, SCALE['densityFromCoverage'])
    shine_score = clamp_score(shine_ratio, SCALE['shineFromRatio'])
    patchiness_score = clamp_score(patchiness_raw, SCALE['patchinessFromRaw'])
    pigmentation_score = clamp_score(pigmentation_raw, SCALE['pigmentationFromRaw'])
    hair_area = max(hair_coverage, SCALE['minHairArea'])
    edge_to_hair_ratio = edge_density / hair_area
    hair_thickness_score = int(max(0, min(100, round(
        100 - edge_to_hair_ratio * SCALE['hairThicknessEdgeFactor']
    ))))

    is_fa = lang == 'fa'
    density_level = 'زیاد' if density_score > 65 else 'متوسط' if density_score > 35 else 'کم'
    if not is_fa:
        density_level = 'High' if density_score > 65 else 'Medium' if density_score > 35 else 'Low'

    loss_level = 'خفیف' if density_score > 50 else 'متوسط' if density_score > 25 else 'شدید'
    if not is_fa:
        loss_level = 'Mild' if density_score > 50 else 'Moderate' if density_score > 25 else 'Severe'

    lesions = []
    if dandruff_score > 25:
        lesions.append({
            'type': 'شوره احتمالی' if is_fa else 'Possible dandruff',
            'confidence': round(dandruff_score / 100, 2),
            'bbox': [0, 0, w, h],
        })
    if redness_score > 20:
        lesions.append({
            'type': 'قرمزی' if is_fa else 'Redness',
            'confidence': round(redness_score / 100, 2),
            'bbox': [int(w * 0.1), int(h * 0.1), int(w * 0.9), int(h * 0.9)],
        })
    if patchiness_score > 35:
        lesions.append({
            'type': 'الگوی ریزش لکه‌ای احتمالی' if is_fa else 'Possible patchy hair-loss pattern',
            'confidence': round(patchiness_score / 100, 2),
            'bbox': [0, 0, w, h],
        })
    if pigmentation_score > 40:
        lesions.append({
            'type': 'ناهمگونی رنگدانه پوست سر' if is_fa else 'Scalp pigmentation irregularity',
            'confidence': round(min(100, pigmentation_score) / 100, 2),
            'bbox': [int(w * 0.15), int(h * 0.15), int(w * 0.85), int(h * 0.85)],
        })

    recommendations = []
    if white_flake_ratio > 0.08:
        recommendations.append('شامپوی ضدشوره توصیه می‌شود' if is_fa else 'Anti-dandruff shampoo recommended')
    if redness_ratio > 0.06:
        recommendations.append('از محصولات ملایم استفاده کنید' if is_fa else 'Use gentle scalp products')
    if texture_variance > 45 and brightness < 120:
        recommendations.append('کنترل چربی پوست سر' if is_fa else 'Oil control recommended')
    if brightness > 150 and hair_coverage < 0.25:
        recommendations.append('مشاوره تخصصی ریزش مو' if is_fa else 'Hair loss specialist consultation')
    if shine_ratio > 0.012:
        recommendations.append('براقی/چربی سطحی بالا: شامپوی کنترل‌چربی' if is_fa else 'High surface shine: oil-control shampoo recommended')
    if patchiness_raw > 0.18:
        recommendations.append('پراکندگی نامنظم پوشش مو: بررسی توسط متخصص' if is_fa else 'Irregular hair coverage: specialist review recommended')
    if pigmentation_raw > 35:
        recommendations.append('ناهمگونی رنگ پوست سر: بررسی بی‌رنگی یا التهاب موضعی' if is_fa else 'Uneven scalp pigmentation: check for discoloration/irritation')
    if not recommendations:
        recommendations.append('مراقبت روزانه و پیگیری دوره‌ای' if is_fa else 'Daily care and periodic follow-up')

    chart_data = [
        {'label': 'تراکم' if is_fa else 'Density', 'value': density_score},
        {'label': 'چربی' if is_fa else 'Oiliness', 'value': oiliness_score},
        {'label': 'خشکی' if is_fa else 'Dryness', 'value': dryness_score},
        {'label': 'شوره' if is_fa else 'Dandruff', 'value': dandruff_score},
        {'label': 'قرمزی' if is_fa else 'Redness', 'value': redness_score},
        {'label': 'براقی/سبوره' if is_fa else 'Shine', 'value': shine_score},
        {'label': 'لکه‌ای بودن' if is_fa else 'Patchiness', 'value': patchiness_score},
        {'label': 'ناهمگونی رنگدانه' if is_fa else 'Pigmentation', 'value': pigmentation_score},
        {'label': 'ضخامت تار مو' if is_fa else 'Hair thickness', 'value': hair_thickness_score},
    ]

    annotated_b64 = None
    if HAS_MPL:
        overlay = img.copy()
        cv2.rectangle(overlay, (2, 2), (w - 2, h - 2), (34, 197, 94), 2)
        cv2.putText(overlay, 'Offline' if not is_fa else 'Offline FA', (10, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (34, 197, 94), 2)
        _, buf = cv2.imencode('.png', overlay)
        annotated_b64 = 'data:image/png;base64,' + base64.b64encode(buf).decode('ascii')

    observations = []
    if dandruff_score >= 12:
        observations.append('dandruff')
    if shine_score >= 18 or (oiliness_score >= 40 and shine_score >= 10):
        observations.append('seborrhea')
    if dandruff_score >= 20 and oiliness_score >= 35 and redness_score >= 15:
        observations.append('seborrheicDermatitis')
    if oiliness_score >= 35:
        observations.append('oily')
    if dryness_score >= 35:
        observations.append('dry')
    if redness_score >= 18 and dryness_score >= 25:
        observations.append('sensitivity')
    if density_score <= 55:
        observations.append('hairLoss')
    if hair_thickness_score <= 55:
        observations.append('thinning')
    if hair_thickness_score <= 45 and density_score >= 35:
        observations.append('breakage')
    if hair_thickness_score <= 40 and shine_score >= 20:
        observations.append('hairShaftDamage')
    if redness_score >= 12:
        observations.append('inflammation')
    if redness_score >= 22:
        observations.append('erythemaDiffuse')
    if pigmentation_score >= 25 or (dandruff_score >= 20 and redness_score >= 15):
        observations.append('lesions')
    if patchiness_score >= 22 and density_score <= 60:
        observations.append('alopecia')
    if density_score <= 50 and oiliness_score >= 30 and patchiness_score < 40:
        observations.append('androgenic')
    if density_score <= 48 and 15 <= patchiness_score < 45 and oiliness_score < 55:
        observations.append('femalePattern')
    if dandruff_score >= 25 and redness_score >= 20 and pigmentation_score >= 20:
        observations.append('psoriasis')
    if redness_score >= 30 and shine_score < 35:
        observations.append('folliculitis')
    if dandruff_score >= 22 and redness_score >= 18 and pigmentation_score >= 25:
        observations.append('fungal')
    if patchiness_score >= 35 and density_score <= 40:
        observations.append('scarring')
    if density_score <= 55 and patchiness_score < 30 and oiliness_score < 50:
        observations.append('telogen')
    if hair_thickness_score <= 42 and density_score <= 55:
        observations.append('miniaturization')
    if density_score <= 45 and oiliness_score >= 40 and patchiness_score >= 18:
        observations.append('yellowDots')
    if patchiness_score >= 30 and density_score <= 42 and pigmentation_score >= 20:
        observations.append('whiteDots')
    if dandruff_score >= 18 and redness_score >= 14:
        observations.append('perifollicularScaling')
    if density_score <= 40 and patchiness_score >= 25:
        observations.append('emptyFollicles')
    if redness_score >= 20 and dandruff_score >= 15:
        observations.append('pruritus')

    return {
        'lesions': lesions,
        'observations': observations,
        'hairDensity': {'level': density_level, 'score': density_score},
        'scalpCondition': {
            'oiliness': oiliness_score,
            'dryness': dryness_score,
            'redness': redness_score,
            'dandruff': dandruff_score,
            'shine': shine_score,
            'patchiness': patchiness_score,
            'pigmentation': pigmentation_score,
            'hairThickness': hair_thickness_score,
        },
        'hairLoss': {
            'level': loss_level,
            'pattern': 'تحلیل محلی Python' if is_fa else 'Local Python analysis',
        },
        'recommendations': recommendations,
        'metrics': {
            'brightness': int(brightness),
            'rednessRatio': round(redness_ratio, 4),
            'whiteFlakeRatio': round(white_flake_ratio, 4),
            'textureVariance': round(texture_variance, 2),
            'hairCoverageRatio': round(hair_coverage, 4),
            'shineRatio': round(shine_ratio, 4),
            'edgeDensity': round(edge_density, 4),
            'patchinessRaw': round(patchiness_raw, 4),
            'pigmentationRaw': round(pigmentation_raw, 2),
        },
        'chartData': chart_data,
        'annotatedImageBase64': annotated_b64,
        'engine': 'python',
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: analyze.py <image_path> [lang]'}))
        sys.exit(1)

    image_path = sys.argv[1]
    lang = sys.argv[2] if len(sys.argv) > 2 else 'fa'

    try:
        result = analyze(image_path, lang)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'error': str(e)}))
        sys.exit(1)
