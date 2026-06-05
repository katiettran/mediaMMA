class PhotoBooth {
    constructor() {
        this.video = document.getElementById('video');
        this.canvas = document.getElementById('canvas');
        this.countdown = document.getElementById('countdown');
        this.countdownNumber = this.countdown.querySelector('.countdown-number');
        
        this.startCameraBtn = document.getElementById('startCamera');
        this.takePhotoBtn = document.getElementById('takePhoto');
        this.resetPhotosBtn = document.getElementById('resetPhotos');
        this.downloadStripBtn = document.getElementById('downloadStrip');
        
        this.photoSlots = [
            document.getElementById('photo1'),
            document.getElementById('photo2'),
            document.getElementById('photo3')
        ];
        
        this.stream = null;
        this.currentPhotoIndex = 0;
        this.photos = [];
        this.isCountingDown = false;
        
        this.initializeEventListeners();
    }
    
    initializeEventListeners() {
        this.startCameraBtn.addEventListener('click', () => this.startCamera());
        this.takePhotoBtn.addEventListener('click', () => this.startPhotoCapture());
        this.resetPhotosBtn.addEventListener('click', () => this.resetPhotos());
        this.downloadStripBtn.addEventListener('click', () => this.downloadPhotoStrip());
    }
    
    async startCamera() {
        try {
            this.startCameraBtn.disabled = true;
            this.startCameraBtn.innerHTML = '<span class="loading"></span> Starting Camera...';
            
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'user'
                }
            });
            
            this.video.srcObject = this.stream;
            await this.video.play();
            
            this.startCameraBtn.style.display = 'none';
            this.takePhotoBtn.disabled = false;
            
            // Add success animation
            this.video.style.animation = 'flash 0.5s ease-in-out';
            setTimeout(() => {
                this.video.style.animation = '';
            }, 500);
            
        } catch (error) {
            console.error('Error accessing camera:', error);
            this.showError('Unable to access camera. Please make sure you have granted camera permissions.');
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
            count--;
            this.countdownNumber.textContent = count;
            
            if (count <= 0) {
                clearInterval(countdownInterval);
                this.capturePhoto();
            }
        }, 1000);
    }
    
    capturePhoto() {
        // Set canvas dimensions to match video
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        
        // Draw video frame to canvas
        const context = this.canvas.getContext('2d');
        context.drawImage(this.video, 0, 0);
        
        // Convert canvas to blob
        this.canvas.toBlob((blob) => {
            const photoUrl = URL.createObjectURL(blob);
            this.photos[this.currentPhotoIndex] = photoUrl;
            this.displayPhoto(this.currentPhotoIndex, photoUrl);
            
            // Hide countdown
            this.countdown.style.display = 'none';
            
            // Add capture animation
            this.video.classList.add('photo-captured');
            setTimeout(() => {
                this.video.classList.remove('photo-captured');
            }, 300);
            
            this.currentPhotoIndex++;
            
            // Update button states
            if (this.currentPhotoIndex < 3) {
                this.takePhotoBtn.disabled = false;
            } else {
                this.takePhotoBtn.disabled = true;
                this.takePhotoBtn.innerHTML = '<span class="icon">✅</span> All Photos Taken';
            }
            
            // Enable download if all photos are taken
            if (this.currentPhotoIndex === 3) {
                this.downloadStripBtn.disabled = false;
            }
            
            this.isCountingDown = false;
        }, 'image/jpeg', 0.9);
    }
    
    displayPhoto(index, photoUrl) {
        const slot = this.photoSlots[index];
        slot.innerHTML = `<img src="${photoUrl}" alt="Photo ${index + 1}">`;
        slot.classList.add('filled');
        
        // Add entrance animation
        slot.style.animation = 'flash 0.5s ease-in-out';
        setTimeout(() => {
            slot.style.animation = '';
        }, 500);
    }
    
    resetPhotos() {
        // Clear all photos
        this.photos = [];
        this.currentPhotoIndex = 0;
        
        // Reset photo slots
        this.photoSlots.forEach((slot, index) => {
            slot.innerHTML = `<div class="placeholder">Photo ${index + 1}</div>`;
            slot.classList.remove('filled');
        });
        
        // Reset buttons
        this.takePhotoBtn.disabled = false;
        this.takePhotoBtn.innerHTML = '<span class="icon">⚡</span> Take Photo';
        this.downloadStripBtn.disabled = true;
        
        // Show camera button if camera is not active
        if (!this.stream) {
            this.startCameraBtn.style.display = 'flex';
            this.startCameraBtn.disabled = false;
            this.startCameraBtn.innerHTML = '<span class="icon">📷</span> Start Camera';
        }
    }
    
    async downloadPhotoStrip() {
        if (this.photos.length !== 3) return;
        
        try {
            this.downloadStripBtn.disabled = true;
            this.downloadStripBtn.innerHTML = '<span class="loading"></span> Creating Strip...';
            
            // Create a canvas for the photo strip
            const stripCanvas = document.createElement('canvas');
            const stripContext = stripCanvas.getContext('2d');
            
            // Set dimensions for the photo strip (3 photos stacked vertically)
            const photoWidth = 400;
            const photoHeight = 300;
            const spacing = 20;
            const totalHeight = (photoHeight * 3) + (spacing * 2);
            
            stripCanvas.width = photoWidth;
            stripCanvas.height = totalHeight;
            
            // Fill background
            stripContext.fillStyle = '#f0f0f0';
            stripContext.fillRect(0, 0, photoWidth, totalHeight);
            
            // Load and draw each photo
            const loadPromises = this.photos.map((photoUrl, index) => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const y = index * (photoHeight + spacing);
                        
                        // Calculate aspect ratio to fit photo properly
                        const aspectRatio = img.width / img.height;
                        let drawWidth = photoWidth;
                        let drawHeight = photoHeight;
                        
                        if (aspectRatio > photoWidth / photoHeight) {
                            drawHeight = photoWidth / aspectRatio;
                        } else {
                            drawWidth = photoHeight * aspectRatio;
                        }
                        
                        const x = (photoWidth - drawWidth) / 2;
                        const drawY = y + (photoHeight - drawHeight) / 2;
                        
                        stripContext.drawImage(img, x, drawY, drawWidth, drawHeight);
                        resolve();
                    };
                    img.src = photoUrl;
                });
            });
            
            await Promise.all(loadPromises);
            
            // Add title
            stripContext.fillStyle = '#333';
            stripContext.font = 'bold 24px Poppins';
            stripContext.textAlign = 'center';
            stripContext.fillText('PhotoBooth Strip', photoWidth / 2, 30);
            
            // Add timestamp
            const timestamp = new Date().toLocaleString();
            stripContext.font = '14px Poppins';
            stripContext.fillStyle = '#666';
            stripContext.fillText(timestamp, photoWidth / 2, totalHeight - 10);
            
            // Convert to blob and download
            stripCanvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `photobooth-strip-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.downloadStripBtn.disabled = false;
                this.downloadStripBtn.innerHTML = '<span class="icon">💾</span> Download Strip';
            }, 'image/png');
            
        } catch (error) {
            console.error('Error creating photo strip:', error);
            this.showError('Error creating photo strip. Please try again.');
            this.downloadStripBtn.disabled = false;
            this.downloadStripBtn.innerHTML = '<span class="icon">💾</span> Download Strip';
        }
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
        
        // Clean up photo URLs
        this.photos.forEach(url => {
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

// Add some fun sound effects (optional)
function playShutterSound() {
    // Create a simple beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
} 