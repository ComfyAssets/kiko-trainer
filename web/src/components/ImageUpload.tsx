import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { PhotoIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useStore } from '../store/useStore';

export const ImageUpload: React.FC = () => {
  const { images, addImages, removeImage, updateCaption } = useStore();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    addImages(acceptedFiles);
  }, [addImages]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.heic', '.heif']
    },
    multiple: true,
  });

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        }`}
      >
        <input {...getInputProps()} />
        <PhotoIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {isDragActive
            ? 'Drop the images here...'
            : 'Drag & drop images here, or click to select'}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
          Supports PNG, JPG, JPEG, WebP, HEIC, HEIF
        </p>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {images.map((image) => (
            <ImageCard
              key={image.id}
              image={image}
              onRemove={removeImage}
              onUpdate={updateCaption}
            />
          ))}
        </div>
      )}

      <div className="text-sm text-gray-600 dark:text-gray-400">
        {images.length} image{images.length !== 1 ? 's' : ''} selected
      </div>
    </div>
  );
};

const ImageCard: React.FC<{
  image: any; // Fix TypeScript error - ReturnType inference issue
  onRemove: (id: string) => void;
  onUpdate: (id: string, caption: string) => void;
}> = ({ image, onRemove, onUpdate }) => {
  const [text, setText] = React.useState(image.caption || '');
  React.useEffect(() => {
    setText(image.caption || '');
  }, [image.id, image.caption]);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-3">
      <div className="relative group">
        <div className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
          <img
            src={image.preview}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        </div>
        <button
          onClick={() => onRemove(image.id)}
          className="absolute top-2 right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg"
          title="Remove image"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Caption
        </label>
        <textarea
          placeholder="Enter caption or click Auto-Caption..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => onUpdate(image.id, text)}
          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 dark:focus:ring-primary-400 focus:border-transparent text-gray-900 dark:text-gray-100 resize-none"
          rows={4}
        />
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          {image.file.name}
        </div>
      </div>
    </div>
  );
};
