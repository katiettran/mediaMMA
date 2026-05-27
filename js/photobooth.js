import { compositeVirtualBackground, drawCover } from '../mediaPipe.js';

const ASSETS = {
    virtualBackground: 'IMG_6390.PNG',
    stripFrame: 'PTB.png',
};

const PHOTO_WIDTH = 520;
const PHOTO_HEIGHT = 390;
const STRIP_PADDING_TOP = 376;
const STRIP_PADDING_BOTTOM = 106;
const STRIP_PADDING_SIDE = 40;
const STRIP_GAP = 24;

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load ${src}`));
        img.src = src;
    });
}

class PhotoBooth {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.countdown = document.getElementById('countdown');
        this.countdownNumber = this.countdown.querySelector('.countdown-number');

        this.captureScreen = document.getElementById('captureScreen');
        this.resultsScreen = document.getElementById('resultsScreen');
        this.instructions = document.getElementById('instructions');
        this.photoProgress = document.getElementById('photoProgress');
        this.stripPreview = document.getElementById('stripPreview');

        this.startCameraBtn = document.getElementById('startCamera');
        this.takePhotoBtn = document.getElementById('takePhoto');
        this.downloadStripBtn = document.getElementById('downloadStrip');
        this.shareStripBtn = document.getElementById('shareStrip');
        this.retakePhotosBtn = document.getElementById('retakePhotos');

        this.photoSlots = [
            document.getElementById('photo1'),
            document.getElementById('photo2'),
            document.getElementById('photo3'),
        ];

        this.stream = null;
        this.currentPhotoIndex = 0;
        this.photos = [];
        this.isCountingDown = false;
        this.stripBlob = null;
        this.stripPreviewUrl = null;
        this.kvBackground = null;
        this.frameImage = null;
        this.stripCreatedAt = null;

        this.initializeEventListeners();
        this.preloadAssets();
    }

    async preloadAssets() {
        try {
            [this.kvBackground, this.frameImage] = await Promise.all([
                loadImage(ASSETS.virtualBackground),
                loadImage(ASSETS.stripFrame),
            ]);
        } catch (error) {
            console.error('Failed to preload images:', error);
            this.showError('Could not load booth images. Check that IMG_6390.PNG and PTB.PNG are in the project folder.');
        }
    }

    initializeEventListeners() {
        this.startCameraBtn.addEventListener('click', () => this.startCamera());
        this.takePhotoBtn.addEventListener('click', () => this.startPhotoCapture());
        this.downloadStripBtn.addEventListener('click', () => this.downloadPhotoStrip());
        this.shareStripBtn.addEventListener('click', () => this.sharePhotoStrip());
        this.retakePhotosBtn.addEventListener('click', () => this.retake());
    }

    updateProgress() {
        this.photoProgress.textContent = `${this.currentPhotoIndex} / 3 photos`;
    }

    async startCamera() {
        try {
            this.startCameraBtn.disabled = true;
            this.startCameraBtn.innerHTML = '<span class="loading"></span> Starting Camera...';

            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user',
                },
                audio: false,
            });

            this.video.srcObject = this.stream;
            await this.video.play();

            this.startCameraBtn.style.display = 'none';
            this.takePhotoBtn.disabled = false;
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.showError('Unable to access camera. Please allow camera permissions and try again.');
            this.startCameraBtn.disabled = false;
            this.startCameraBtn.innerHTML = '<span class="icon">📷</span> Start Camera';
        }
    }

    startPhotoCapture() {
        if (this.isCountingDown || this.currentPhotoIndex >= 3) return;

        this.isCountingDown = true;
        this.takePhotoBtn.disabled = true;

        this.countdown.style.display = 'flex';
        this.countdownNumber.textContent = '3';

        let count = 3;
        const countdownInterval = setInterval(() => {
            count -= 1;
            this.countdownNumber.textContent = count > 0 ? String(count) : '';

            if (count <= 0) {
                clearInterval(countdownInterval);
                this.capturePhoto();
            }
        }, 1000);
    }

    async capturePhoto() {
        if (!this.kvBackground) {
            await this.preloadAssets();
        }

        this.canvas.width = PHOTO_WIDTH;
        this.canvas.height = PHOTO_HEIGHT;

        try {
            await compositeVirtualBackground(
                this.video,
                this.kvBackground,
                this.canvas
            );
        } catch (error) {
            console.warn('Virtual background failed, using fallback:', error);
            const ctx = this.canvas.getContext('2d');
            drawCover(ctx, this.kvBackground, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);
            drawCover(ctx, this.video, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT, true);
        }

        this.canvas.toBlob(
            (blob) => {
                if (!blob) {
                    this.showError('Could not capture photo. Please try again.');
                    this.finishCaptureAttempt();
                    return;
                }

                if (this.currentPhotoIndex === 0) {
                    this.stripCreatedAt = new Date();
                }

                const photoUrl = this.canvas.toDataURL('image/jpeg', 0.92);
                this.photos[this.currentPhotoIndex] = photoUrl;
                this.displayPhoto(this.currentPhotoIndex, photoUrl);

                this.countdown.style.display = 'none';
                this.video.classList.add('photo-captured');
                setTimeout(() => this.video.classList.remove('photo-captured'), 300);

                this.currentPhotoIndex += 1;
                this.updateProgress();

                if (this.currentPhotoIndex < 3) {
                    this.takePhotoBtn.disabled = false;
                } else {
                    this.takePhotoBtn.disabled = true;
                    this.takePhotoBtn.innerHTML = '<span class="icon">✅</span> All Photos Taken';
                    this.showResults();
                }

                this.finishCaptureAttempt();
            },
            'image/jpeg',
            0.92
        );
    }

    finishCaptureAttempt() {
        this.isCountingDown = false;
    }

    displayPhoto(index, photoUrl) {
        const slot = this.photoSlots[index];
        slot.innerHTML = `<img src="${photoUrl}" alt="Photo ${index + 1}">`;
        slot.classList.add('filled');
    }

    drawStripTimestamp(ctx, stripWidth, stripHeight) {
        const timestamp = (this.stripCreatedAt || new Date()).toLocaleString();
        ctx.save();
        ctx.font = '600 14px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
        ctx.shadowBlur = 4;
        ctx.fillText(timestamp, stripWidth / 2, stripHeight - 14);
        ctx.restore();
    }

    async buildStripCanvas() {
        const photoUrls = [this.photos[0], this.photos[1], this.photos[2]];
        if (!this.frameImage || photoUrls.some((url) => !url)) {
            throw new Error('Photos or frame not ready');
        }

        const photoImages = await Promise.all(photoUrls.map((url) => loadImage(url)));

        const stripWidth = this.frameImage.naturalWidth;
        const stripHeight = this.frameImage.naturalHeight;

        const photoYPositions = [
            STRIP_PADDING_TOP,
            STRIP_PADDING_TOP + PHOTO_HEIGHT + STRIP_GAP,
            STRIP_PADDING_TOP + (PHOTO_HEIGHT + STRIP_GAP) * 2,
        ];

        const stripCanvas = document.createElement('canvas');
        stripCanvas.width = stripWidth;
        stripCanvas.height = stripHeight;
        const ctx = stripCanvas.getContext('2d');

        ctx.drawImage(this.frameImage, 0, 0);

        photoImages.forEach((img, index) => {
            ctx.drawImage(
                img,
                STRIP_PADDING_SIDE,
                photoYPositions[index],
                PHOTO_WIDTH,
                PHOTO_HEIGHT
            );
        });

        this.drawStripTimestamp(ctx, stripWidth, stripHeight);

        return stripCanvas;
    }

    async showResults() {
        try {
            const stripCanvas = await this.buildStripCanvas();
            const blob = await new Promise((resolve) => {
                stripCanvas.toBlob(resolve, 'image/png');
            });

            if (!blob) throw new Error('Could not build strip');

            if (this.stripPreviewUrl) {
                URL.revokeObjectURL(this.stripPreviewUrl);
            }

            this.stripBlob = blob;
            this.stripPreviewUrl = URL.createObjectURL(blob);
            this.stripPreview.src = this.stripPreviewUrl;

            this.captureScreen.hidden = true;
            this.resultsScreen.hidden = false;
            this.instructions.hidden = true;
        } catch (error) {
            console.error('Error building strip preview:', error);
            this.showError('Could not build your photo strip. Please try again.');
        }
    }

    async downloadPhotoStrip() {
        if (!this.stripBlob) {
            try {
                const stripCanvas = await this.buildStripCanvas();
                this.stripBlob = await new Promise((resolve) => {
                    stripCanvas.toBlob(resolve, 'image/png');
                });
            } catch (error) {
                this.showError('Nothing to download yet.');
                return;
            }
        }

        const url = URL.createObjectURL(this.stripBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `photobooth-strip-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async sharePhotoStrip() {
        if (!this.stripBlob) {
            this.showError('Create your strip first by taking all 3 photos.');
            return;
        }

        const file = new File([this.stripBlob], `photobooth-strip-${Date.now()}.png`, {
            type: 'image/png',
        });

        if (navigator.share && navigator.canShare?.({ files: [file] })) {
            try {
                await navigator.share({
                    title: 'My PhotoBooth Strip',
                    text: 'Check out my photobooth strip!',
                    files: [file],
                });
                return;
            } catch (error) {
                if (error.name === 'AbortError') return;
            }
        }

        await this.downloadPhotoStrip();
        this.showError('Sharing is not supported in this browser — your strip was downloaded instead.');
    }

    retake() {
        this.photos = [];
        this.currentPhotoIndex = 0;
        this.stripBlob = null;
        this.stripCreatedAt = null;

        if (this.stripPreviewUrl) {
            URL.revokeObjectURL(this.stripPreviewUrl);
            this.stripPreviewUrl = null;
        }

        this.stripPreview.removeAttribute('src');

        this.photoSlots.forEach((slot, index) => {
            slot.innerHTML = `<div class="placeholder">Photo ${index + 1}</div>`;
            slot.classList.remove('filled');
        });

        this.takePhotoBtn.disabled = !this.stream;
        this.takePhotoBtn.innerHTML = '<span class="icon">⚡</span> Take Photo';
        this.updateProgress();

        this.resultsScreen.hidden = true;
        this.captureScreen.hidden = false;
        this.instructions.hidden = false;
    }

    showError(message) {
        const notification = document.createElement('div');
        notification.className = 'toast-error';
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach((track) => track.stop());
        }

        if (this.stripPreviewUrl) {
            URL.revokeObjectURL(this.stripPreviewUrl);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const photobooth = new PhotoBooth();

    window.addEventListener('beforeunload', () => {
        photobooth.cleanup();
    });
});
