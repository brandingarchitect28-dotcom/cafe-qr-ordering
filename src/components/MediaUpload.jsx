/**
 * MediaUpload.jsx
 *
 * Reusable media upload component supporting:
 *  - Images (JPG, PNG, WebP)
 *  - GIFs
 *  - MP4 videos (autoplay, muted, loop)
 *
 * Props:
 *  value        — current media URL string
 *  onChange     — callback(url) when upload completes
 *  storagePath  — Firebase Storage path prefix e.g. "menu/cafeId"
 *  label        — field label
 *  maxSizeMB    — max file size (default 20MB)
 *  disabled     — disable input
 */

import React, { useState, useRef } from 'react';
import { uploadImage } from '../utils/uploadImage';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Upload, X, Film, Image, RefreshCw } from 'lucide-react';

// ─── helpers ─────────────────────────────────────────────────────────────────

export const getMediaType = (url) => {
  if (!url) return null;
  const lower = url.toLowerCase().split('?')[0]; // strip query params
  if (lower.endsWith('.mp4') || lower.includes('/mp4')) return 'video';
  if (lower.endsWith('.gif') || lower.includes('/gif')) return 'gif';
  return 'image';
};

export const getFileMediaType = (file) => {
  if (!file) return null;
  if (file.type === 'video/mp4') return 'video';
  if (file.type === 'image/gif') return 'gif';
  if (file.type.startsWith('image/')) return 'image';
  return null;
};

// Upload video via REST API (SDK doesn't support progress for large files well)
async function uploadVideoREST(file, storagePath) {
  const bucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  if (!bucket) throw new Error('VITE_FIREBASE_STORAGE_BUCKET not set');

  const { auth } = await import('../config/firebase');
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  const idToken = await user.getIdToken(true);

  const encodedPath = encodeURIComponent(storagePath);
  const uploadURL =
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o` +
    `?uploadType=media&name=${encodedPath}`;

  const response = await fetch(uploadURL, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'Authorization': `Firebase ${idToken}`,
    },
    body: file,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Upload failed (HTTP ${response.status})`);
  }

  const data = await response.json();
  const token = data.downloadTokens;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodedPath}?alt=media&token=${token}`;
}

// ─── MediaPreview — renders image / gif / video correctly ────────────────────

export const MediaPreview = ({ url, className = '', alt = 'Media' }) => {
  const type = getMediaType(url);
  if (!url) return null;

  if (type === 'video') {
    return (
      <video
        src={url}
        autoPlay
        muted
        loop
        playsInline
        className={className}
        style={{ objectFit: 'cover' }}
      />
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className={className}
      style={{ objectFit: 'cover' }}
    />
  );
};

// ─── Main MediaUpload component ───────────────────────────────────────────────

const MediaUpload = ({
  value,
  onChange,
  storagePath,
  label = 'Media',
  maxSizeMB = 20,
  disabled = false,
  accept = 'image/*,image/gif,video/mp4',
}) => {
  const [uploading,  setUploading ] = useState(false);
  const [progress,   setProgress  ] = useState(0);
  const [localPreview, setLocalPreview] = useState(null);
  const [localType,    setLocalType   ] = useState(null);
  const fileRef = useRef(null);

  const ALLOWED = ['image/jpeg','image/png','image/webp','image/gif','video/mp4'];
  const MAX_BYTES = maxSizeMB * 1024 * 1024;

  const handleSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    if (!ALLOWED.includes(file.type)) {
      toast.error('Only JPG, PNG, WebP, GIF, and MP4 files are supported');
      return;
    }

    // Validate size
    if (file.size > MAX_BYTES) {
      toast.error(`File must be under ${maxSizeMB}MB`);
      return;
    }

    const mediaType = getFileMediaType(file);
    setLocalType(mediaType);

    // Local preview
    const objectUrl = URL.createObjectURL(file);
    setLocalPreview(objectUrl);

    // Upload
    setUploading(true);
    setProgress(0);
    const toastId = toast.loading('Uploading...');

    try {
      const path = `${storagePath}/${Date.now()}_${file.name}`;
      let url;

      if (mediaType === 'video') {
        // Video: use REST upload
        setProgress(30);
        toast.loading('Uploading video...', { id: toastId });
        url = await uploadVideoREST(file, path);
        setProgress(100);
      } else {
        // Image / GIF: use existing uploadImage utility
        url = await uploadImage(file, path, (pct) => {
          setProgress(pct);
          toast.loading(`Uploading... ${pct}%`, { id: toastId });
        });
      }

      onChange(url);
      toast.success(`${mediaType === 'video' ? 'Video' : 'Image'} uploaded ✓`, { id: toastId });
    } catch (err) {
      toast.error(err.message || 'Upload failed', { id: toastId });
      setLocalPreview(null);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleRemove = () => {
    onChange('');
    setLocalPreview(null);
    setLocalType(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const displayUrl   = localPreview || value;
  const displayType  = localPreview ? localType : getMediaType(value);

  return (
    <div className="space-y-3">
      <label className="block text-white text-sm font-medium">{label}</label>

      {/* Drop zone */}
      <div
        onClick={() => !disabled && !uploading && fileRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg transition-all cursor-pointer ${
          uploading
            ? 'border-[#D4AF37]/50 bg-[#D4AF37]/5 cursor-default'
            : disabled
            ? 'border-white/5 opacity-50 cursor-not-allowed'
            : 'border-white/10 hover:border-[#D4AF37]/40 hover:bg-white/2'
        }`}
      >
        <AnimatePresence mode="wait">
          {displayUrl ? (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative aspect-video rounded-lg overflow-hidden"
            >
              {displayType === 'video' ? (
                <video
                  src={displayUrl}
                  autoPlay muted loop playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={displayUrl}
                  alt="Preview"
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              )}

              {/* Type badge */}
              <div className="absolute top-2 left-2">
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${
                  displayType === 'video'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : displayType === 'gif'
                    ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                    : 'bg-white/10 text-white/70 border border-white/20'
                }`}>
                  {displayType === 'video' ? <Film className="w-3 h-3" /> : <Image className="w-3 h-3" />}
                  {displayType?.toUpperCase()}
                </span>
              </div>

              {/* Remove button */}
              {!disabled && !uploading && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(); }}
                  className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-red-500/80 text-white rounded-full transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Change overlay */}
              {!disabled && !uploading && (
                <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-all flex items-center justify-center opacity-0 hover:opacity-100">
                  <span className="text-white text-sm font-semibold bg-black/60 px-3 py-1.5 rounded-lg">
                    Click to change
                  </span>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center gap-3 py-8 px-4"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                <Upload className="w-6 h-6 text-[#A3A3A3]" />
              </div>
              <div className="text-center">
                <p className="text-white text-sm font-medium">Upload media</p>
                <p className="text-[#A3A3A3] text-xs mt-1">
                  JPG, PNG, GIF, or MP4 · Max {maxSizeMB}MB
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Progress bar */}
        {uploading && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10 rounded-b-lg overflow-hidden">
            <motion.div
              className="h-full bg-[#D4AF37]"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ ease: 'linear' }}
            />
          </div>
        )}

        {/* Uploading overlay */}
        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
            <div className="flex items-center gap-2 text-white text-sm">
              <RefreshCw className="w-4 h-4 animate-spin text-[#D4AF37]" />
              Uploading {progress}%
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={accept}
        onChange={handleSelect}
        disabled={disabled || uploading}
        className="hidden"
      />

      <p className="text-[#555] text-xs">
        {displayType === 'video'
          ? '🎬 Video will autoplay silently on the menu page'
          : displayType === 'gif'
          ? '🎞 GIF will animate on the menu page'
          : '🖼 Image will display on the menu page'}
      </p>
    </div>
  );
};

export default MediaUpload;
