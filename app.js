(() => {
    'use strict';

    // Initialize Pica with optimal settings
    const pica = window.pica({
        features: ['js', 'wasm', 'ww'], // Use WebAssembly and Web Workers when available
        idle: 2000
    });

    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const qualitySlider = document.getElementById('quality');
    const qualityValue = document.getElementById('quality-value');
    const losslessCheckbox = document.getElementById('lossless');
    const sizeOptions = document.getElementById('size-options');
    const customSizeInput = document.getElementById('custom-size-input');
    const customWidthInput = document.getElementById('custom-width');
    const advancedToggle = document.getElementById('advanced-toggle');
    const advancedPanel = document.getElementById('advanced-panel');
    const sharpnessSlider = document.getElementById('sharpness');
    const sharpnessValue = document.getElementById('sharpness-value');
    const alphaQualityCheckbox = document.getElementById('alpha-quality');
    const autoOrientCheckbox = document.getElementById('auto-orient');
    const removeWatermarkCheckbox = document.getElementById('remove-watermark');
    const convertSection = document.getElementById('convert-section');
    const convertBtn = document.getElementById('convert-btn');
    const fileCount = document.getElementById('file-count');
    const previewList = document.getElementById('preview-list');
    const totalEstimate = document.getElementById('total-estimate');
    const previewItemTemplate = document.getElementById('preview-item-template');
    const resultsSection = document.getElementById('results');
    const imageList = document.getElementById('image-list');
    const downloadAllBtn = document.getElementById('download-all');
    const imageItemTemplate = document.getElementById('image-item-template');

    // State
    let selectedFiles = [];
    let convertedImages = [];
    let selectedSize = '1920';
    let estimateDebounceTimer = null;

    // Initialize
    function init() {
        setupEventListeners();
    }

    function setupEventListeners() {
        // Quality slider
        qualitySlider.addEventListener('input', (e) => {
            qualityValue.textContent = e.target.value;
            debounceUpdateEstimates();
        });

        // Sharpness slider
        sharpnessSlider.addEventListener('input', (e) => {
            sharpnessValue.textContent = e.target.value;
        });

        // Lossless checkbox
        losslessCheckbox.addEventListener('change', debounceUpdateEstimates);

        // Advanced toggle
        advancedToggle.addEventListener('click', toggleAdvancedPanel);

        // Size options
        sizeOptions.addEventListener('click', handleSizeSelect);

        // Custom width input
        customWidthInput.addEventListener('input', debounceUpdateEstimates);

        // Drag and drop
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('dragleave', handleDragLeave);
        dropZone.addEventListener('drop', handleDrop);
        dropZone.addEventListener('click', () => fileInput.click());

        // File input
        fileInput.addEventListener('change', handleFileSelect);

        // Convert button
        convertBtn.addEventListener('click', startConversion);

        // Download all
        downloadAllBtn.addEventListener('click', downloadAllAsZip);
    }

    function toggleAdvancedPanel() {
        const isOpen = !advancedPanel.hidden;
        advancedPanel.hidden = isOpen;
        advancedToggle.classList.toggle('open', !isOpen);
    }

    function debounceUpdateEstimates() {
        clearTimeout(estimateDebounceTimer);
        estimateDebounceTimer = setTimeout(() => {
            updateAllEstimates();
        }, 150);
    }

    function getResizeAlgorithm() {
        const selected = document.querySelector('input[name="resize-algo"]:checked');
        return selected ? selected.value : 'lanczos3';
    }

    function handleSizeSelect(e) {
        const option = e.target.closest('.size-option');
        if (!option) return;

        document.querySelectorAll('.size-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        option.classList.add('selected');

        selectedSize = option.dataset.size;

        if (selectedSize === 'custom') {
            customSizeInput.hidden = false;
            customWidthInput.focus();
        } else {
            customSizeInput.hidden = true;
        }

        debounceUpdateEstimates();
    }

    function getTargetWidth() {
        if (selectedSize === 'original') {
            return null;
        }
        if (selectedSize === 'custom') {
            const customValue = parseInt(customWidthInput.value);
            return isNaN(customValue) || customValue < 50 ? 1200 : customValue;
        }
        return parseInt(selectedSize);
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    }

    function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files).filter(isValidImage);
        if (files.length > 0) {
            addFiles(files);
        }
    }

    function handleFileSelect(e) {
        const files = Array.from(e.target.files).filter(isValidImage);
        if (files.length > 0) {
            addFiles(files);
        }
    }

    function isValidImage(file) {
        return file.type === 'image/jpeg' || file.type === 'image/png';
    }

    async function addFiles(files) {
        convertSection.hidden = false;

        for (const file of files) {
            const dimensions = await getImageDimensions(file);
            const element = createPreviewItem(file, dimensions);
            previewList.appendChild(element);

            const fileData = {
                file,
                width: dimensions.width,
                height: dimensions.height,
                element,
                estimatedSize: null
            };
            selectedFiles.push(fileData);
            calculateEstimate(fileData);
        }

        updateFileCount();
    }

    function getImageDimensions(file) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
                URL.revokeObjectURL(img.src);
            };
            img.onerror = () => {
                resolve({ width: 0, height: 0 });
                URL.revokeObjectURL(img.src);
            };
            img.src = URL.createObjectURL(file);
        });
    }

    function createPreviewItem(file, dimensions) {
        const template = previewItemTemplate.content.cloneNode(true);
        const li = template.querySelector('.preview-item');

        const thumb = li.querySelector('.preview-thumb img');
        thumb.src = URL.createObjectURL(file);

        const name = li.querySelector('.preview-name');
        name.textContent = file.name;

        const dims = li.querySelector('.preview-dimensions');
        dims.textContent = `${dimensions.width} × ${dimensions.height}`;

        const estimate = li.querySelector('.estimate-size');
        estimate.textContent = 'Calculating...';
        estimate.classList.add('calculating');

        const removeBtn = li.querySelector('.btn-remove');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFile(file);
        });

        return li;
    }

    function removeFile(fileToRemove) {
        const index = selectedFiles.findIndex(f => f.file === fileToRemove);
        if (index !== -1) {
            const fileData = selectedFiles[index];
            const thumb = fileData.element.querySelector('.preview-thumb img');
            if (thumb && thumb.src) {
                URL.revokeObjectURL(thumb.src);
            }
            fileData.element.remove();
            selectedFiles.splice(index, 1);
            updateFileCount();
            updateTotalEstimate();

            if (selectedFiles.length === 0) {
                convertSection.hidden = true;
            }
        }
    }

    function updateFileCount() {
        fileCount.textContent = selectedFiles.length;
    }

    async function calculateEstimate(fileData) {
        const quality = parseInt(qualitySlider.value) / 100;
        const lossless = losslessCheckbox.checked;
        const targetWidth = getTargetWidth();

        let outputWidth = fileData.width;
        let outputHeight = fileData.height;

        if (targetWidth && fileData.width > targetWidth) {
            const ratio = targetWidth / fileData.width;
            outputWidth = targetWidth;
            outputHeight = Math.round(fileData.height * ratio);
        }

        const pixels = outputWidth * outputHeight;
        let estimatedBytes;

        if (lossless) {
            estimatedBytes = pixels * 1.5;
        } else {
            const qualityFactor = 0.2 + (quality * 0.8);
            estimatedBytes = pixels * 0.4 * qualityFactor;
        }

        estimatedBytes = Math.max(estimatedBytes, 1024);
        fileData.estimatedSize = estimatedBytes;

        const estimate = fileData.element.querySelector('.estimate-size');
        estimate.textContent = `~${formatFileSize(estimatedBytes)}`;
        estimate.classList.remove('calculating');

        const dims = fileData.element.querySelector('.preview-dimensions');
        if (targetWidth && fileData.width > targetWidth) {
            dims.textContent = `${fileData.width}×${fileData.height} → ${outputWidth}×${outputHeight}`;
        } else {
            dims.textContent = `${fileData.width} × ${fileData.height}`;
        }

        updateTotalEstimate();
    }

    function updateAllEstimates() {
        for (const fileData of selectedFiles) {
            const estimate = fileData.element.querySelector('.estimate-size');
            estimate.textContent = 'Calculating...';
            estimate.classList.add('calculating');
            calculateEstimate(fileData);
        }
    }

    function updateTotalEstimate() {
        const total = selectedFiles.reduce((sum, f) => sum + (f.estimatedSize || 0), 0);
        if (total > 0) {
            totalEstimate.textContent = `~${formatFileSize(total)}`;
        } else {
            totalEstimate.textContent = '--';
        }
    }

    async function startConversion() {
        if (selectedFiles.length === 0) return;

        convertBtn.disabled = true;
        convertBtn.innerHTML = `
            <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
            Converting...
        `;

        resultsSection.hidden = false;
        imageList.innerHTML = '';
        convertedImages = [];

        const quality = parseInt(qualitySlider.value) / 100;
        const lossless = losslessCheckbox.checked;
        const targetWidth = getTargetWidth();
        const sharpness = parseFloat(sharpnessSlider.value);
        const resizeAlgo = getResizeAlgorithm();
        const optimizeAlpha = alphaQualityCheckbox.checked;
        const removeWatermark = removeWatermarkCheckbox.checked;

        for (const fileData of selectedFiles) {
            const listItem = createImageListItem(fileData.file);
            imageList.appendChild(listItem);

            try {
                const result = await convertToWebP(fileData.file, {
                    quality,
                    lossless,
                    targetWidth,
                    sharpness,
                    resizeAlgo,
                    optimizeAlpha,
                    removeWatermark
                });
                convertedImages.push(result);
                updateListItemSuccess(listItem, fileData.file, result);
            } catch (error) {
                console.error('Conversion error:', error);
                updateListItemError(listItem, error.message);
            }
        }

        // Cleanup
        for (const fileData of selectedFiles) {
            const thumb = fileData.element.querySelector('.preview-thumb img');
            if (thumb && thumb.src) {
                URL.revokeObjectURL(thumb.src);
            }
        }

        convertBtn.disabled = false;
        convertBtn.innerHTML = `
            <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
            </svg>
            Convert to WebP
        `;
        selectedFiles = [];
        previewList.innerHTML = '';
        fileInput.value = '';
        convertSection.hidden = true;
    }

    function createImageListItem(file) {
        const template = imageItemTemplate.content.cloneNode(true);
        const li = template.querySelector('.image-item');

        const preview = li.querySelector('.image-preview img');
        preview.src = URL.createObjectURL(file);

        const name = li.querySelector('.image-name');
        name.textContent = file.name;

        const originalSize = li.querySelector('.original-size');
        originalSize.textContent = formatFileSize(file.size);

        const spinner = li.querySelector('.spinner');
        spinner.hidden = false;

        return li;
    }

    function updateListItemSuccess(li, originalFile, result) {
        const spinner = li.querySelector('.spinner');
        const downloadBtn = li.querySelector('.btn-download');
        const convertedSize = li.querySelector('.converted-size');
        const reduction = li.querySelector('.reduction');

        spinner.hidden = true;
        downloadBtn.hidden = false;

        const dimText = result.dimensions
            ? ` (${result.dimensions.width}×${result.dimensions.height})`
            : '';
        convertedSize.textContent = formatFileSize(result.blob.size) + dimText;

        const reductionPercent = ((1 - result.blob.size / originalFile.size) * 100).toFixed(1);
        reduction.textContent = reductionPercent > 0
            ? `-${reductionPercent}%`
            : `+${Math.abs(reductionPercent)}%`;
        reduction.style.color = reductionPercent > 0 ? 'var(--success)' : '#ef4444';

        downloadBtn.addEventListener('click', () => {
            downloadFile(result.blob, result.name);
        });
    }

    function updateListItemError(li, message) {
        const spinner = li.querySelector('.spinner');
        const sizeInfo = li.querySelector('.size-info');

        spinner.hidden = true;
        sizeInfo.innerHTML = `<span style="color: #ef4444;">Error: ${message}</span>`;
    }

    async function convertToWebP(file, options) {
        const {
            quality,
            lossless,
            targetWidth,
            sharpness,
            resizeAlgo,
            optimizeAlpha,
            removeWatermark
        } = options;

        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = async () => {
                try {
                    let outputWidth = img.naturalWidth;
                    let outputHeight = img.naturalHeight;

                    // Calculate output dimensions
                    if (targetWidth && img.naturalWidth > targetWidth) {
                        const ratio = targetWidth / img.naturalWidth;
                        outputWidth = targetWidth;
                        outputHeight = Math.round(img.naturalHeight * ratio);
                    }

                    // Create source canvas with original image
                    const sourceCanvas = document.createElement('canvas');
                    const sourceCtx = sourceCanvas.getContext('2d', {
                        alpha: true,
                        colorSpace: 'srgb'
                    });
                    sourceCanvas.width = img.naturalWidth;
                    sourceCanvas.height = img.naturalHeight;
                    sourceCtx.drawImage(img, 0, 0);

                    // Remove AI watermark if enabled
                    if (removeWatermark) {
                        removeAIWatermark(sourceCanvas, sourceCtx);
                    }

                    // Create destination canvas
                    const destCanvas = document.createElement('canvas');
                    destCanvas.width = outputWidth;
                    destCanvas.height = outputHeight;

                    // Map algorithm names to Pica filter names
                    const filterMap = {
                        'lanczos3': 'lanczos3',
                        'lanczos2': 'lanczos2',
                        'mks2013': 'mks2013'
                    };

                    // Use Pica for high-quality resize with selected algorithm
                    if (outputWidth !== img.naturalWidth || outputHeight !== img.naturalHeight) {
                        await pica.resize(sourceCanvas, destCanvas, {
                            filter: filterMap[resizeAlgo] || 'lanczos3',
                            alpha: optimizeAlpha,
                            unsharpAmount: sharpness > 0 ? Math.round(sharpness * 160) : 0,
                            unsharpRadius: sharpness > 0 ? 0.5 + (sharpness * 0.5) : 0,
                            unsharpThreshold: 0
                        });
                    } else {
                        // No resize needed, just copy
                        const destCtx = destCanvas.getContext('2d');
                        destCtx.drawImage(sourceCanvas, 0, 0);

                        // Apply sharpening even without resize if requested
                        if (sharpness > 0) {
                            applyUnsharpMask(destCanvas, sharpness);
                        }
                    }

                    // Convert to WebP
                    const mimeType = 'image/webp';
                    const outputQuality = lossless ? 1.0 : quality;

                    destCanvas.toBlob(
                        (blob) => {
                            if (blob) {
                                const baseName = file.name.replace(/\.(jpe?g|png)$/i, '');
                                const sizeSuffix = targetWidth && outputWidth < img.naturalWidth
                                    ? `-${outputWidth}w`
                                    : '';
                                resolve({
                                    blob: blob,
                                    name: `${baseName}${sizeSuffix}.webp`,
                                    originalName: file.name,
                                    dimensions: { width: outputWidth, height: outputHeight }
                                });
                            } else {
                                reject(new Error('Failed to create WebP blob'));
                            }
                            URL.revokeObjectURL(img.src);
                        },
                        mimeType,
                        outputQuality
                    );
                } catch (error) {
                    URL.revokeObjectURL(img.src);
                    reject(error);
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(img.src);
                reject(new Error('Failed to load image'));
            };

            img.src = URL.createObjectURL(file);
        });
    }

    // Manual unsharp mask for when no resize occurs
    function applyUnsharpMask(canvas, amount) {
        const ctx = canvas.getContext('2d');
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Create a blurred version
        const blurCanvas = document.createElement('canvas');
        blurCanvas.width = canvas.width;
        blurCanvas.height = canvas.height;
        const blurCtx = blurCanvas.getContext('2d');
        blurCtx.filter = 'blur(1px)';
        blurCtx.drawImage(canvas, 0, 0);
        const blurData = blurCtx.getImageData(0, 0, canvas.width, canvas.height).data;

        // Apply unsharp mask
        const strength = amount * 0.8;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.min(255, Math.max(0, data[i] + (data[i] - blurData[i]) * strength));
            data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + (data[i + 1] - blurData[i + 1]) * strength));
            data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + (data[i + 2] - blurData[i + 2]) * strength));
        }

        ctx.putImageData(imageData, 0, 0);
    }

    // Remove AI watermarks (Gemini star, etc.) from corners
    function removeAIWatermark(canvas, ctx) {
        const width = canvas.width;
        const height = canvas.height;

        // Watermark is typically in bottom-right corner
        // Size is roughly 3-5% of image dimensions
        const watermarkSize = Math.max(40, Math.min(width, height) * 0.05);
        const margin = Math.max(10, watermarkSize * 0.3);

        // Define the watermark region (bottom-right corner)
        const regionX = width - watermarkSize - margin;
        const regionY = height - watermarkSize - margin;
        const regionW = watermarkSize + margin;
        const regionH = watermarkSize + margin;

        // Get image data for the region and surrounding area
        const sampleSize = watermarkSize * 2;
        const sampleX = Math.max(0, width - sampleSize - margin * 2);
        const sampleY = Math.max(0, height - sampleSize - margin * 2);

        const imageData = ctx.getImageData(sampleX, sampleY, width - sampleX, height - sampleY);
        const data = imageData.data;
        const imgWidth = imageData.width;
        const imgHeight = imageData.height;

        // Calculate average color from the left and top edges of the sample area
        // (avoiding the watermark itself)
        let avgR = 0, avgG = 0, avgB = 0, count = 0;

        // Sample from left edge (avoiding bottom-right corner)
        for (let y = 0; y < imgHeight - watermarkSize; y++) {
            for (let x = 0; x < Math.min(20, imgWidth / 4); x++) {
                const idx = (y * imgWidth + x) * 4;
                avgR += data[idx];
                avgG += data[idx + 1];
                avgB += data[idx + 2];
                count++;
            }
        }

        // Sample from top edge
        for (let y = 0; y < Math.min(20, imgHeight / 4); y++) {
            for (let x = 0; x < imgWidth; x++) {
                const idx = (y * imgWidth + x) * 4;
                avgR += data[idx];
                avgG += data[idx + 1];
                avgB += data[idx + 2];
                count++;
            }
        }

        if (count > 0) {
            avgR = Math.round(avgR / count);
            avgG = Math.round(avgG / count);
            avgB = Math.round(avgB / count);
        }

        // Use content-aware fill: blend watermark area with surrounding pixels
        const localX = regionX - sampleX;
        const localY = regionY - sampleY;

        for (let y = localY; y < imgHeight; y++) {
            for (let x = localX; x < imgWidth; x++) {
                const idx = (y * imgWidth + x) * 4;

                // Calculate distance from the corner
                const distX = (x - localX) / regionW;
                const distY = (y - localY) / regionH;
                const dist = Math.sqrt(distX * distX + distY * distY);

                // Get reference color from nearby non-watermark area
                let refR, refG, refB;

                // Sample from the left of the watermark area
                const refX = Math.max(0, localX - 10);
                const refIdx = (y * imgWidth + refX) * 4;
                refR = data[refIdx];
                refG = data[refIdx + 1];
                refB = data[refIdx + 2];

                // Also sample from above
                const refY = Math.max(0, localY - 10);
                const refIdx2 = (refY * imgWidth + x) * 4;
                refR = Math.round((refR + data[refIdx2]) / 2);
                refG = Math.round((refG + data[refIdx2 + 1]) / 2);
                refB = Math.round((refB + data[refIdx2 + 2]) / 2);

                // Detect if this pixel might be part of the watermark
                // Watermarks are typically lighter/white on the image
                const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
                const refBrightness = (refR + refG + refB) / 3;

                // If pixel is significantly brighter than reference, it's likely watermark
                if (brightness > refBrightness + 30 || brightness > 200) {
                    // Blend with reference colors
                    const blendFactor = Math.min(1, (brightness - refBrightness) / 100);
                    data[idx] = Math.round(data[idx] * (1 - blendFactor) + refR * blendFactor);
                    data[idx + 1] = Math.round(data[idx + 1] * (1 - blendFactor) + refG * blendFactor);
                    data[idx + 2] = Math.round(data[idx + 2] * (1 - blendFactor) + refB * blendFactor);
                }
            }
        }

        ctx.putImageData(imageData, sampleX, sampleY);

        // Apply slight blur to the affected region to smooth edges
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = regionW + 20;
        tempCanvas.height = regionH + 20;
        const tempCtx = tempCanvas.getContext('2d');

        // Copy region
        tempCtx.drawImage(canvas,
            regionX - 10, regionY - 10, regionW + 20, regionH + 20,
            0, 0, regionW + 20, regionH + 20
        );

        // Apply subtle blur
        tempCtx.filter = 'blur(0.5px)';
        tempCtx.drawImage(tempCanvas, 0, 0);

        // Copy back with feathered edge
        ctx.drawImage(tempCanvas,
            0, 0, regionW + 20, regionH + 20,
            regionX - 10, regionY - 10, regionW + 20, regionH + 20
        );
    }

    function downloadFile(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function downloadAllAsZip() {
        if (convertedImages.length === 0) return;

        downloadAllBtn.disabled = true;
        downloadAllBtn.textContent = 'Creating ZIP...';

        try {
            const zip = new JSZip();

            for (const image of convertedImages) {
                zip.file(image.name, image.blob);
            }

            const zipBlob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 6 }
            });

            downloadFile(zipBlob, 'converted-images.zip');
        } catch (error) {
            console.error('ZIP creation error:', error);
            alert('Failed to create ZIP file');
        }

        downloadAllBtn.disabled = false;
        downloadAllBtn.textContent = 'Download All (ZIP)';
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Start the app
    init();
})();
