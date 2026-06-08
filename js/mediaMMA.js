import { compositeVirtualBackground } from './mediaPipe.js';

class PhotoBooth {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        // Capture panel preview (overlay inside capture PNG)
        this.previewCanvas = document.getElementById('previewCanvas');
        this.capturePreview = document.getElementById('capturePreview');


        // Screens
        this.screens = {
            start: document.getElementById('screenStart'),
            capture: document.getElementById('screenCapture'),
            select: document.getElementById('screenSelect'),
            chooseFrame: document.getElementById('screenChooseFrame'),
            final: document.getElementById('screenFinal')
        };

        this.captureCountEl = document.getElementById('captureCount');


        // Buttons / UI
        this.startFlowBtn = document.getElementById('startFlow');
        this.startPanelWrap = document.getElementById('startPanelWrap');
        this.startPanelImg = document.getElementById('startPanelImg');
        this.captureBtn = document.getElementById('capturePhoto');
        this.backToCaptureBtn = document.getElementById('backToCapture');
        this.confirmSelectionBtn = document.getElementById('confirmSelection');
        this.downloadFinalBtn = document.getElementById('downloadFinal');
        this.shareFinalBtn = document.getElementById('shareFinal');

        this.selectGrid = document.getElementById('selectGrid');
        this.selectHint = document.getElementById('selectHint');
        this.finalStripPreview = document.getElementById('finalStripPreview');
        this.toggleBgPreviewBtn = document.getElementById('toggleBgPreview');
        this.backToSelectBtn = document.getElementById('backToSelect');
        this.confirmFrameBtn = document.getElementById('confirmFrame');
        this.frameChoicesEl = document.getElementById('frameChoices');
        this.selectedFrame = null;


        this.stream = null;

        this.layout = 3; // 2 | 3 | 4
        this.captureCount = 6;
        this.currentCaptureIndex = 0;

        // Store as blobs (for share) + objectURLs (for display)
        this.photoBlobs = [];
        this.photoUrls = [];

        this.photoBgBlobs = [];
        this.photoBgUrls = [];
        this.bgPreviewEnabled = true;

        this.selectedIndices = new Set();
        this.finalBlob = null;
        this.isPreviewLoopRunning = false;
        this.frameSlotCache = new Map();
        this.kvBackground = null;
        this.facingMode = 'user';
        this.flipCameraBtn = document.getElementById('flipCamera');
        
        this.initializeEventListeners();
        this.goToScreen('start');
        this.setupStartButtonPlacement();
        this.preloadKvBackground();
    }

    async preloadKvBackground() {
        try {
            this.kvBackground = await this.loadImage('IMG_6390.PNG');
        } catch (e) {
            console.warn('Failed to load IMG_6390.PNG:', e);
            this.kvBackground = null;
        }
    }
    
    initializeEventListeners() {
        this.startFlowBtn.addEventListener('click', () => this.handleStartFlow());
        this.flipCameraBtn.addEventListener('click', async () => {
            this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
            this.stream.getTracks().forEach(t => t.stop());
            this.isPreviewLoopRunning = false;
            await this.startCamera();
            this.startPreviewLoop();
        });
        this.captureBtn.addEventListener('click', () => this.startPhotoCapture());
        this.backToCaptureBtn.addEventListener('click', () => {
        this.resetCapture();
        this.goToScreen('capture');
        });
        this.confirmSelectionBtn.addEventListener('click', () => this.goToChooseFrame());
        this.backToSelectBtn.addEventListener('click', () => this.goToScreen('select'));
        this.confirmFrameBtn.addEventListener('click', () => this.buildFinalStrip());
        this.toggleBgPreviewBtn.addEventListener('click', () => {
        this.bgPreviewEnabled = !this.bgPreviewEnabled;
        this.toggleBgPreviewBtn.textContent = this.bgPreviewEnabled ? 'Background: ON' : 'Background: OFF';
        this.refreshSelectGrid();
    });    
        this.downloadFinalBtn.addEventListener('click', () => this.downloadFinal());
        this.shareFinalBtn.addEventListener('click', () => this.shareFinal());
    }

    setupStartButtonPlacement() {
        const apply = () => {
            if (!this.startPanelWrap || !this.startPanelImg || !this.startFlowBtn) return;
            const img = this.startPanelImg;
            const wrap = this.startPanelWrap;

            // Use the image's intrinsic pixel size as the coordinate space.
            const iw = img.naturalWidth;
            const ih = img.naturalHeight;
            if (!iw || !ih) return;

            const x = Number(wrap.dataset.btnX);
            const y = Number(wrap.dataset.btnY);
            const w = Number(wrap.dataset.btnW);
            const h = Number(wrap.dataset.btnH);

            if (![x, y, w, h].every((n) => Number.isFinite(n))) return;

            const cxPct = ((x + w / 2) / iw) * 100;
            const cyPct = ((y + h / 2) / ih) * 100;
            const wPct = (w / iw) * 100;
            const hPct = (h / ih) * 100;

            // Clamp so it never goes off-panel (prevents "missing" button if numbers exceed image bounds)
            const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
            const safeW = clamp(wPct, 8, 92);
            const safeH = clamp(hPct, 6, 40);
            const safeX = clamp(cxPct, safeW / 2, 100 - safeW / 2);
            const safeY = clamp(cyPct, safeH / 2, 100 - safeH / 2);

            this.startFlowBtn.style.left = `${safeX}%`;
            this.startFlowBtn.style.top = `${safeY}%`;
            this.startFlowBtn.style.width = `${safeW}%`;
            this.startFlowBtn.style.height = `${safeH}%`;
        };

        if (this.startPanelImg?.complete) apply();
        this.startPanelImg?.addEventListener('load', apply, { once: true });
        window.addEventListener('resize', apply);
    }
    
    goToScreen(screenKey) {
        Object.values(this.screens).forEach((el) => { if (el) el.classList.remove('screen--active'); });        
        if (this.screens[screenKey]) this.screens[screenKey].classList.add('screen--active');
        window.scrollTo(0, 0);
        if (screenKey === 'capture') {
            // Ensure preview loop is running on capture screen
            if (this.stream) this.startPreviewLoop();
        }
    }

    async handleStartFlow() {
        // Ask camera permissions after clicking START
        await this.startCamera();
        if (this.stream) {
            this.startPreviewLoop();
            this.captureBtn.disabled = false;
            this.goToScreen('capture');         
        }
    }

    async startCamera() {
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                this.showError('Camera is not supported in this browser.');
                return;
            }
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: this.facingMode
                }
            });
            
            this.video.srcObject = this.stream;
            await this.video.play();
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.showError('Unable to access camera. If you are not on https/localhost, the browser may block camera access.');
        }
    }

    startPreviewLoop() {
        if (!this.previewCanvas || !this.capturePreview) return;
        if (this.isPreviewLoopRunning) return;
        this.isPreviewLoopRunning = true;

        const resizeCanvas = () => {
            const rect = this.capturePreview.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            const targetW = Math.max(1, Math.round(rect.width * dpr));
            const targetH = Math.max(1, Math.round(rect.height * dpr));
            if (this.previewCanvas.width !== targetW || this.previewCanvas.height !== targetH) {
                this.previewCanvas.width = targetW;
                this.previewCanvas.height = targetH;
            }
        };

        const tick = async () => {
            if (!this.stream) {
                this.isPreviewLoopRunning = false;
                return;
            }
            resizeCanvas();

            const ctx = this.previewCanvas.getContext('2d');
            const w = this.previewCanvas.width;
            const h = this.previewCanvas.height;
            ctx.save();
            ctx.clearRect(0, 0, w, h);
            ctx.filter = 'brightness(1.08) blur(0.5px) contrast(0.95)';
            ctx.scale(-1, 1);
            const vw = this.video.videoWidth;
            const vh = this.video.videoHeight;
            const dstAR = w / h;
            const srcAR = vw / vh;
            let sx = 0, sy = 0, sw = vw, sh = vh;
            if (srcAR > dstAR) {
                sw = Math.round(vh * dstAR);
                sx = Math.round((vw - sw) / 2);
            } else {
                sh = Math.round(vw / dstAR);
                sy = Math.round((vh - sh) / 2);
            }
            const zoom = 1.0;
            const zoomedW = Math.round(w / zoom);
            const zoomedH = Math.round(h / zoom);
            const zoomedX = -Math.round((zoomedW - w) / 2) - w;
            const zoomedY = -Math.round((zoomedH - h) / 2);
            ctx.drawImage(this.video, sx, sy, sw, sh, zoomedX, zoomedY, zoomedW, zoomedH);
            ctx.filter = 'none';
            ctx.restore();

            requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
    }
    
    startPhotoCapture() {
        if (!this.stream) return;
        if (this.currentCaptureIndex >= this.captureCount) return;
        
        this.captureBtn.disabled = true;
        

        this.capturePhoto();
        
    }
    
    capturePhoto() {
        // Capture at the stream's real resolution (prevents blurry upscaling).
        const vw = this.video.videoWidth || 1600;
        const vh = this.video.videoHeight || 900;
        const dstAR = 16 / 9;
        const srcAR = vw / vh;

        let cropW = vw;
        let cropH = vh;
        if (srcAR > dstAR) {
            cropH = vh;
            cropW = Math.round(cropH * dstAR);
        } else {
            cropW = vw;
            cropH = Math.round(cropW / dstAR);
        }
        const sx = Math.round((vw - cropW) / 2);
        const sy = Math.round((vh - cropH) / 2);

        const targetW = cropW;
        const targetH = cropH;
        this.canvas.width = targetW;
        this.canvas.height = targetH;
        
        const finishWithBlob = async (blob) => {
            const photoUrl = URL.createObjectURL(blob);
            this.photoBlobs[this.currentCaptureIndex] = blob;
            this.photoUrls[this.currentCaptureIndex] = photoUrl;
            
            
            // Add capture animation
            this.video.classList.add('photo-captured');
            setTimeout(() => {
                this.video.classList.remove('photo-captured');
            }, 300);
            
            this.currentCaptureIndex++;

            if (this.currentCaptureIndex < this.captureCount) {
                this.captureCountEl.textContent = `${this.currentCaptureIndex} / 6`;
                this.captureBtn.disabled = false;
            } else {
                this.captureCountEl.textContent = `6 / 6`;
                await this.applyBackgroundsAndSelect();
            }
                        
        };

        const fallbackRaw = () => {
            const context = this.canvas.getContext('2d');
            context.save();
            context.clearRect(0, 0, targetW, targetH);
            // Mirror while cropping to 4:3
            context.translate(targetW, 0);
            context.scale(-1, 1);
            context.filter = 'brightness(1.08) blur(0.5px) contrast(0.95)';
            context.drawImage(this.video, sx, sy, cropW, cropH, 0, 0, targetW, targetH);
            context.filter = 'none';
            context.drawImage(this.video, sx, sy, cropW, cropH, 0, 0, targetW, targetH);
            context.restore();
            this.canvas.toBlob((blob) => {
                if (!blob) return;
                finishWithBlob(blob);
            }, 'image/jpeg', 0.96);
        };

    fallbackRaw();
    }

    resetCapture() {
        this.captureCountEl.textContent = '0 / 6';
        this.selectedIndices.clear();
        this.currentCaptureIndex = 0;

        this.photoBlobs.forEach((b, idx) => {
            const url = this.photoUrls[idx];
            if (url) URL.revokeObjectURL(url);
        });
        this.photoBlobs = [];
        this.photoUrls = [];

        this.finalBlob = null;
        this.cleanupFinalPreviewUrl();
        this.finalStripPreview.removeAttribute('src');

        this.captureBtn.disabled = false;

        this.photoBgBlobs.forEach((b, idx) => {
        const url = this.photoBgUrls[idx];
        if (url) URL.revokeObjectURL(url);
    });
    this.photoBgBlobs = [];
    this.photoBgUrls = [];
    this.bgPreviewEnabled = true;

    }

   async applyBackgroundsAndSelect() {
    if (this.kvBackground) {
        for (let i = 0; i < this.photoBlobs.length; i++) {
            const img = await this.loadImage(this.photoUrls[i]);
            this.canvas.width = img.width;
            this.canvas.height = img.height;
            await compositeVirtualBackground(img, this.kvBackground, this.canvas);
            const blob = await new Promise(resolve => this.canvas.toBlob(resolve, 'image/png'));
            this.photoBgUrls[i] = URL.createObjectURL(blob);
            this.photoBgBlobs[i] = blob;
        }
    }
    this.goToSelect();
}
    goToSelect() {
        const n = this.layout;
        this.selectedIndices.clear();
        this.selectGrid.innerHTML = '';

        this.selectHint.textContent = `Select ${n} photo${n === 1 ? '' : 's'}.`;

        const displayUrls = this.bgPreviewEnabled && this.photoBgUrls.length 
            ? this.photoBgUrls 
            : this.photoUrls;
        displayUrls.forEach((url, idx) => {
        const item = document.createElement('button');
            item.type = 'button';
            item.className = 'selectItem';
            item.dataset.idx = String(idx);
            item.innerHTML = `<img src="${url}" alt="Photo option ${idx + 1}">`;
            item.addEventListener('click', () => this.toggleSelect(idx, item));
            this.selectGrid.appendChild(item);
        });

        this.updateConfirmState();
        this.goToScreen('select');
    }

   async goToChooseFrame() {
    this.selectedFrame = null;
    this.confirmFrameBtn.disabled = true;
    this.frameChoicesEl.innerHTML = '<p style="color:white;text-align:center">Generating previews...</p>';
    this.goToScreen('chooseFrame');

    const indices = Array.from(this.selectedIndices.values());
    const blobs = this.bgPreviewEnabled && this.photoBgBlobs.length 
        ? this.photoBgBlobs 
        : this.photoBlobs;
    const chosenBlobs = indices.map(i => blobs[i]).filter(Boolean);

    const frames = [
        { id: 'frame1', label: 'Designed Frame', path: 'pics/designedFrame.png' },
        { id: 'frame2', label: 'Plain Frame', path: 'pics/plainFrame.png' },
    ];

    this.frameChoicesEl.innerHTML = '';

    for (const frame of frames) {
        // Build preview canvas for this frame
        const previewCanvas = document.createElement('canvas');
        const ctx = previewCanvas.getContext('2d');
        const overlay = await this.loadImage(frame.path);
        const SCALE = 1;
        previewCanvas.width = overlay.width * SCALE;
        previewCanvas.height = overlay.height * SCALE;
        ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
        this.drawContain(ctx, overlay, 0, 0, overlay.width, overlay.height);

        const layoutSpec = {
            baseCanvasW: 738,
            baseCanvasH: 1270,
            slots: [
                { x: 114.4, y: 186.3, w: 514.1, h: 303.1 },
                { x: 114.4, y: 519.4, w: 514.1, h: 303.1 },
                { x: 114.4, y: 852.5, w: 514.1, h: 303.1 }
            ],
            overlayPath: frame.path,
            expectedSlots: 3
        };

        const slots = await this.getSlotsForFrame(overlay, layoutSpec);
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            const url = URL.createObjectURL(chosenBlobs[i]);
            const img = await this.loadImage(url);
            URL.revokeObjectURL(url);
            this.drawCover(ctx, img, s.x, s.y, s.w, s.h);
        }
        const qr = await this.loadImage('pics/QR.png');
        ctx.drawImage(qr, 649, 1196, 58, 58);

        const previewUrl = await new Promise(resolve => {
            previewCanvas.toBlob(blob => resolve(URL.createObjectURL(blob)), 'image/jpeg', 0.85);
        });

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'frameChoice';
        btn.innerHTML = `<img src="${previewUrl}" alt="${frame.label}" style="width:100%;height:auto;display:block;border-radius:8px;">`;
        btn.addEventListener('click', () => {
            document.querySelectorAll('.frameChoice').forEach(b => b.classList.remove('frameChoice--selected'));
            btn.classList.add('frameChoice--selected');
            this.selectedFrame = frame;
            this.confirmFrameBtn.disabled = false;
        });
        this.frameChoicesEl.appendChild(btn);
    }
}
    refreshSelectGrid() {
    const urls = this.bgPreviewEnabled && this.photoBgUrls.length 
        ? this.photoBgUrls 
        : this.photoUrls;
    document.querySelectorAll('.selectItem img').forEach((img, idx) => {
        img.src = urls[idx];
    });
}

    toggleSelect(idx, el) {
        const max = this.layout;
        if (this.selectedIndices.has(idx)) {
            this.selectedIndices.delete(idx);
            el.classList.remove('selectItem--selected');
            this.updateConfirmState();
            return;
        }

        if (this.selectedIndices.size >= max) {
            this.showError(`You can only select ${max} photo${max === 1 ? '' : 's'}.`);
            return;
        }

        this.selectedIndices.add(idx);
        el.classList.add('selectItem--selected');
        this.updateConfirmState();
    }

    updateConfirmState() {
        const max = this.layout;
        this.confirmSelectionBtn.disabled = this.selectedIndices.size !== max;
    }

    async buildFinalStrip() {
        try {
            const indices = Array.from(this.selectedIndices.values());
            const blobs = this.bgPreviewEnabled && this.photoBgBlobs.length 
            ? this.photoBgBlobs 
            : this.photoBlobs;
        const chosenBlobs = indices.map(i => blobs[i]).filter(Boolean);
            if (chosenBlobs.length !== this.layout) return;

            const stripCanvas = document.createElement('canvas');
            const ctx = stripCanvas.getContext('2d');

            const layout = this.layout;
            const layoutSpec = this.getLayoutSpec();            
            // Load overlay first; export should match frame size (prevents stretching)
            const overlay = await this.loadImage(layoutSpec.overlayPath);
            const EXPORT_SCALE = 2;

            stripCanvas.width = overlay.width * EXPORT_SCALE;
            stripCanvas.height = overlay.height * EXPORT_SCALE;


            ctx.setTransform(EXPORT_SCALE, 0, 0, EXPORT_SCALE, 0, 0);

            // Draw the frame first, then place photos on top of the white boxes.
            // (These frame PNGs include white-filled rectangles, not transparent cutouts.)
            //this.drawContain(ctx, overlay, 0, 0, stripCanvas.width, stripCanvas.height);
            this.drawContain(ctx, overlay, 0, 0, overlay.width, overlay.height);

            const slots = await this.getSlotsForFrame(overlay, layoutSpec);

            // Draw chosen photos into slots (cover fill)
            for (let i = 0; i < slots.length; i++) {
                const scaledSlot = slots[i];
                const url = URL.createObjectURL(chosenBlobs[i]);
                const img = await this.loadImage(url);
                URL.revokeObjectURL(url);

                // The captured image already contains the virtual background (if enabled).
                this.drawCover(ctx, img, scaledSlot.x, scaledSlot.y, scaledSlot.w, scaledSlot.h);
            }
            const qr = await this.loadImage('pics/QR.png');
            ctx.drawImage(qr, 649, 1196, 58, 58); 

            const blob = await new Promise((resolve) => stripCanvas.toBlob(resolve, 'image/png'));
            this.finalBlob = blob;

            const previewUrl = URL.createObjectURL(blob);
            this.finalStripPreview.src = previewUrl;
            // Keep preview URL alive until next restart; revoke on restartFlow/resetCapture

            this.goToScreen('final');
        } catch (error) {
            console.error('Error building final strip:', error);
            this.showError('Could not build the final strip. Please try again.');
        }
    }

        getLayoutSpec() {
            const path = this.selectedFrame?.path || 'pics/plainFrame.png';
            return {
                baseCanvasW: 738,
                baseCanvasH: 1270,
                slots: [
                    { x: 114.4, y: 186.3, w: 514.1, h: 303.1 },
                    { x: 114.4, y: 519.4, w: 514.1, h: 303.1 },
                    { x: 114.4, y: 852.5, w: 514.1, h: 303.1 }
                ],
                overlayPath: path,
                expectedSlots: 3
            };
        }

    async getSlotsForFrame(overlayImg, layoutSpec) {
        if (layoutSpec.slots && layoutSpec.baseCanvasW && layoutSpec.baseCanvasH) {
            const scaleX = overlayImg.width / layoutSpec.baseCanvasW;
            const scaleY = overlayImg.height / layoutSpec.baseCanvasH;
            return layoutSpec.slots.map((s) => ({
                x: s.x * scaleX,
                y: s.y * scaleY,
                w: s.w * scaleX,
                h: s.h * scaleY,
            }));
        }

        const key = layoutSpec.overlayPath;
        if (this.frameSlotCache.has(key)) return this.frameSlotCache.get(key);

        const slots = this.detectWhiteBoxSlots(overlayImg, layoutSpec.expectedSlots);
        this.frameSlotCache.set(key, slots);
        return slots;
    }

    /*async getSlotsForFrame(overlayImg, layoutSpec) {
        return layoutSpec.slots;
    } */
    detectWhiteBoxSlots(img, expectedCount) {
        const w = img.width;
        const h = img.height;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const { data } = ctx.getImageData(0, 0, w, h);
        const visited = new Uint8Array(w * h);
        const isWhite = (i) => data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245 && data[i + 3] > 200;

        const boxes = [];
        const idx = (x, y) => y * w + x;

        const minArea = Math.max(1500, Math.floor((w * h) * 0.003)); // ignores tiny specks

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const p = idx(x, y);
                if (visited[p]) continue;
                const di = p * 4;
                if (!isWhite(di)) continue;

                // Flood fill
                let minX = x, maxX = x, minY = y, maxY = y;
                let area = 0;
                const stack = [p];
                visited[p] = 1;

                while (stack.length) {
                    const cur = stack.pop();
                    area++;
                    const cx = cur % w;
                    const cy = (cur / w) | 0;
                    if (cx < minX) minX = cx;
                    if (cx > maxX) maxX = cx;
                    if (cy < minY) minY = cy;
                    if (cy > maxY) maxY = cy;

                    // 4-neighbors
                    if (cx > 0) {
                        const n = cur - 1;
                        if (!visited[n] && isWhite(n * 4)) { visited[n] = 1; stack.push(n); }
                    }
                    if (cx < w - 1) {
                        const n = cur + 1;
                        if (!visited[n] && isWhite(n * 4)) { visited[n] = 1; stack.push(n); }
                    }
                    if (cy > 0) {
                        const n = cur - w;
                        if (!visited[n] && isWhite(n * 4)) { visited[n] = 1; stack.push(n); }
                    }
                    if (cy < h - 1) {
                        const n = cur + w;
                        if (!visited[n] && isWhite(n * 4)) { visited[n] = 1; stack.push(n); }
                    }
                }

                if (area >= minArea) {
                    boxes.push({
                        x: minX,
                        y: minY,
                        w: (maxX - minX + 1),
                        h: (maxY - minY + 1),
                        area,
                    });
                }
            }
        }

        // Keep the biggest N boxes (white rectangles)
        boxes.sort((a, b) => b.area - a.area);
        const top = boxes.slice(0, expectedCount);

        // Sort top-to-bottom then left-to-right
        top.sort((a, b) => (a.y - b.y) || (a.x - b.x));

        // Slight inset so we don't cover borders
        return top.map((b) => ({
            x: b.x + 2,
            y: b.y + 2,
            w: Math.max(1, b.w - 4),
            h: Math.max(1, b.h - 4),
        }));
    }

    loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
            img.src = src;
        });
    }

    drawCover(ctx, img, x, y, w, h) {
        const imgAR = img.width / img.height;
        const slotAR = w / h;
        let sx = 0, sy = 0, sw = img.width, sh = img.height;

        if (imgAR > slotAR) {
            // wider: crop sides
            sh = img.height;
            sw = sh * slotAR;
            sx = (img.width - sw) / 2;
        } else {
            // taller: crop top/bottom
            sw = img.width;
            sh = sw / slotAR;
            sy = (img.height - sh) / 2;
        }

        ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
    }

    drawContain(ctx, img, x, y, w, h) {
        const imgAR = img.width / img.height;
        const slotAR = w / h;
        let dw = w, dh = h;
        if (imgAR > slotAR) {
            dh = w / imgAR;
        } else {
            dw = h * imgAR;
        }
        const dx = x + (w - dw) / 2;
        const dy = y + (h - dh) / 2;
        ctx.drawImage(img, dx, dy, dw, dh);
    }

    downloadFinal() {
        if (!this.finalBlob) return;
        const url = URL.createObjectURL(this.finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `photobooth-strip-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async shareFinal() {
        if (!this.finalBlob) return;
        if (!navigator.share) {
            this.showError('Sharing is not supported on this device/browser. Please download instead.');
            return;
        }

        try {
            const file = new File([this.finalBlob], `photobooth-strip-${Date.now()}.png`, { type: 'image/png' });
            if (navigator.canShare && !navigator.canShare({ files: [file] })) {
                this.showError('Sharing files is not supported here. Please download instead.');
                return;
            }
            await navigator.share({ files: [file], title: 'Photostrip' });
        } catch (error) {
            // user cancelled is fine
            console.warn('Share failed/cancelled:', error);
        }
    }

    restartFlow() {
        this.cleanupFinalPreviewUrl();
        this.resetCapture();
        this.layout = 3;
        this.goToScreen('capture');
    }

    cleanupFinalPreviewUrl() {
        const src = this.finalStripPreview.getAttribute('src');
        if (src && src.startsWith('blob:')) URL.revokeObjectURL(src);
    }

    restartAll() {
        this.cleanupFinalPreviewUrl();
        this.resetCapture();
        this.layout = 3;
        this.goToScreen('start');
    }
    
    showError(message) {
        // Create error notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff4757;
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
            z-index: 1000;
            font-family: 'Poppins', sans-serif;
            max-width: 300px;
        `;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 5000);
    }
    
    // Cleanup method
    cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
        this.isPreviewLoopRunning = false;
        
        this.cleanupFinalPreviewUrl();
        this.photoUrls.forEach(url => {
            if (url) URL.revokeObjectURL(url);
        });
            this.photoBgUrls.forEach(url => {
        if (url) URL.revokeObjectURL(url);
    });
    }
}

// Initialize the photobooth when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const photobooth = new PhotoBooth();
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
        photobooth.cleanup();
    });
});

