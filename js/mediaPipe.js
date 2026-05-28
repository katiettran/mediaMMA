let segmenterPromise = null;

export function getSegmenter() {
    if (!segmenterPromise) {
        segmenterPromise = (async () => {
            const { FilesetResolver, ImageSegmenter } = await import(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14'
            );
            const vision = await FilesetResolver.forVisionTasks(
                'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
            );
            return ImageSegmenter.createFromOptions(vision, {
                baseOptions: {
                    modelAssetPath:
                        'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite',
                    delegate: 'GPU',
                },
                runningMode: 'IMAGE',
                outputCategoryMask: true,
                outputConfidenceMasks: false,
            });
        })().catch((err) => {
            console.warn('Selfie segmenter unavailable:', err);
            segmenterPromise = null;
            return null;
        });
    }
    return segmenterPromise;
}

function imageSize(img) {
    return {
        width: img.videoWidth || img.naturalWidth || img.width,
        height: img.videoHeight || img.naturalHeight || img.height,
    };
}

export function drawCover(ctx, img, x, y, w, h, mirror = false) {
    const { width: iw, height: ih } = imageSize(img);
    if (!iw || !ih) return;

    const ir = iw / ih;
    const r = w / h;
    let sw;
    let sh;
    let sx;
    let sy;

    if (ir > r) {
        sh = ih;
        sw = sh * r;
        sx = (iw - sw) / 2;
        sy = 0;
    } else {
        sw = iw;
        sh = sw / r;
        sx = 0;
        sy = (ih - sh) / 2;
    }

    if (mirror) {
        ctx.save();
        ctx.translate(x + w, y);
        ctx.scale(-1, 1);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        ctx.restore();
        return;
    }

    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

export function drawContain(ctx, img, x, y, w, h) {
    const { width: iw, height: ih } = imageSize(img);
    if (!iw || !ih) return;

    const ir = iw / ih;
    const r = w / h;
    let dw = w;
    let dh = h;
    if (ir > r) {
        dh = w / ir;
    } else {
        dw = h * ir;
    }
    const dx = x + (w - dw) / 2;
    const dy = y + (h - dh) / 2;
    ctx.drawImage(img, dx, dy, dw, dh);
}

// Small internal cache to avoid allocating canvases every frame
const _cache = {
    videoCanvas: null,
    maskCanvas: null,
    personCanvas: null,
};

export async function compositeVirtualBackground(video, kvBackground, outCanvas) {
    const w = outCanvas.width;
    const h = outCanvas.height;
    const ctx = outCanvas.getContext('2d');

    if (!_cache.videoCanvas) _cache.videoCanvas = document.createElement('canvas');
    if (!_cache.maskCanvas) _cache.maskCanvas = document.createElement('canvas');
    if (!_cache.personCanvas) _cache.personCanvas = document.createElement('canvas');

    const videoCanvas = _cache.videoCanvas;
    videoCanvas.width = w;
    videoCanvas.height = h;
    const videoCtx = videoCanvas.getContext('2d');
    drawCover(videoCtx, video, 0, 0, w, h, true);

    const segmenter = await getSegmenter();
    if (!segmenter) {
        ctx.clearRect(0, 0, w, h);
        drawCover(ctx, video, 0, 0, w, h, true);
        return;
    }

    const result = segmenter.segment(videoCanvas);
    const mask = result.categoryMask;
    if (!mask) {
        ctx.clearRect(0, 0, w, h);
        drawCover(ctx, video, 0, 0, w, h, true);
        return;
    }

    const maskW = mask.width;
    const maskH = mask.height;
    const categoryData = mask.getAsUint8Array();

    const maskCanvas = _cache.maskCanvas;
    maskCanvas.width = maskW;
    maskCanvas.height = maskH;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImageData = maskCtx.createImageData(maskW, maskH);

    for (let i = 0; i < categoryData.length; i++) {
        const isPerson = categoryData[i] === 0;
        const offset = i * 4;
        maskImageData.data[offset] = 255;
        maskImageData.data[offset + 1] = 255;
        maskImageData.data[offset + 2] = 255;
        maskImageData.data[offset + 3] = isPerson ? 255 : 0;
    }
    maskCtx.putImageData(maskImageData, 0, 0);

    const personCanvas = _cache.personCanvas;
    personCanvas.width = w;
    personCanvas.height = h;
    const personCtx = personCanvas.getContext('2d');
    personCtx.clearRect(0, 0, w, h);
    personCtx.drawImage(videoCanvas, 0, 0);
    personCtx.globalCompositeOperation = 'destination-in';
    // Feather mask edges a bit to avoid harsh cutouts
    personCtx.filter = 'blur(2px)';
    personCtx.drawImage(maskCanvas, 0, 0, w, h);
    personCtx.filter = 'none';
    personCtx.globalCompositeOperation = 'source-over';

    mask.close();

    ctx.clearRect(0, 0, w, h);
    // Contain so the full background image is visible (no cropping)
    drawContain(ctx, kvBackground, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(personCanvas, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
}

