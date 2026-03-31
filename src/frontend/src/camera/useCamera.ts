import { useCallback, useEffect, useRef, useState } from "react";

export interface CameraConfig {
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
  quality?: number;
  format?: "image/jpeg" | "image/png" | "image/webp";
}

export interface CameraError {
  type: "permission" | "not-supported" | "not-found" | "unknown";
  message: string;
}

export const useCamera = (config: CameraConfig = {}) => {
  const {
    facingMode = "environment",
    width = 1920,
    height = 1080,
    quality = 0.8,
    format = "image/jpeg",
  } = config;

  const [isActive, setIsActive] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentFacingMode, setCurrentFacingMode] = useState(facingMode);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    const supported = !!navigator.mediaDevices?.getUserMedia;
    setIsSupported(supported);
  }, []);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, []);

  const ensureNativePermissions = useCallback(async () => {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return true;
    const camera = cap?.Plugins?.Camera;
    if (!camera) return true;
    const status = await camera.checkPermissions();
    if (status.camera === "granted") return true;
    const requested = await camera.requestPermissions({ permissions: ["camera"] });
    return requested.camera === "granted";
  }, []);

  const cleanup = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    }

    if (videoRef.current) videoRef.current.srcObject = null;

    setIsActive(false);
  }, []);

  const createMediaStream = useCallback(
    async (facing: "user" | "environment") => {
      try {
        const hasPermission = await ensureNativePermissions();
        if (!hasPermission) {
          throw { type: "permission", message: "Camera permission denied" };
        }

        const constraints = {
          video: {
            facingMode: facing,
            width: { ideal: width },
            height: { ideal: height },
          },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (!isMountedRef.current) {
          for (const track of stream.getTracks()) track.stop();
          return null;
        }

        return stream;
      } catch (err: any) {
        if (err.type && err.message) throw err;

        let errorType: CameraError["type"] = "unknown";
        let errorMessage = "Failed to access camera";

        if (err.name === "NotAllowedError") {
          errorType = "permission";
          errorMessage = "Camera permission denied";
        } else if (err.name === "NotFoundError") {
          errorType = "not-found";
          errorMessage = "No camera device found";
        } else if (err.name === "NotSupportedError") {
          errorType = "not-supported";
          errorMessage = "Camera is not supported";
        }

        throw { type: errorType, message: errorMessage };
      }
    },
    [ensureNativePermissions, width, height],
  );

  const setupVideo = useCallback(async (stream: MediaStream) => {
    if (!videoRef.current) return false;

    const video = videoRef.current;
    video.srcObject = stream;

    return new Promise<boolean>((resolve) => {
      const onLoadedMetadata = () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("error", onError);
        video.play().catch(() => undefined);
        resolve(true);
      };

      const onError = () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("error", onError);
        resolve(false);
      };

      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.addEventListener("error", onError);

      if (video.readyState >= 1) onLoadedMetadata();
    });
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    if (isSupported === false || isLoading) return false;

    setIsLoading(true);
    setError(null);

    try {
      cleanup();
      const stream = await createMediaStream(currentFacingMode);
      if (!stream) return false;

      streamRef.current = stream;
      const success = await setupVideo(stream);

      if (success && isMountedRef.current) {
        setIsActive(true);
        return true;
      }

      cleanup();
      return false;
    } catch (err: any) {
      if (isMountedRef.current) setError(err);
      cleanup();
      return false;
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [isSupported, isLoading, currentFacingMode, cleanup, createMediaStream, setupVideo]);

  const stopCamera = useCallback(async (): Promise<void> => {
    if (isLoading) return;

    setIsLoading(true);
    cleanup();
    setError(null);
    await new Promise((resolve) => setTimeout(resolve, 100));

    if (isMountedRef.current) setIsLoading(false);
  }, [isLoading, cleanup]);

  const switchCamera = useCallback(
    async (newFacingMode?: "user" | "environment"): Promise<boolean> => {
      if (isSupported === false || isLoading) return false;

      const targetFacingMode =
        newFacingMode ||
        (currentFacingMode === "user" ? "environment" : "user");

      setIsLoading(true);
      setError(null);

      try {
        cleanup();
        setCurrentFacingMode(targetFacingMode);
        await new Promise((resolve) => setTimeout(resolve, 100));

        const stream = await createMediaStream(targetFacingMode);
        if (!stream) return false;

        streamRef.current = stream;
        const success = await setupVideo(stream);

        if (success && isMountedRef.current) {
          setIsActive(true);
          return true;
        }

        cleanup();
        return false;
      } catch (err: any) {
        if (isMountedRef.current) setError(err);

        cleanup();
        return false;
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    },
    [
      isSupported,
      isLoading,
      currentFacingMode,
      cleanup,
      createMediaStream,
      setupVideo,
    ],
  );

  const retry = useCallback(async (): Promise<boolean> => {
    if (isLoading) return false;

    setError(null);
    await stopCamera();
    await new Promise((resolve) => setTimeout(resolve, 200));
    return startCamera();
  }, [isLoading, stopCamera, startCamera]);

  const capturePhoto = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      if (!videoRef.current || !canvasRef.current || !isActive) {
        resolve(null);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      if (currentFacingMode === "user") {
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0);
      } else {
        ctx.drawImage(video, 0, 0);
      }

      canvas.toBlob(
        (blob) => {
          if (blob) {
            const extension = format.split("/")[1];
            const file = new File([blob], `photo_${Date.now()}.${extension}`, {
              type: format,
            });
            resolve(file);
          } else {
            resolve(null);
          }
        },
        format,
        quality,
      );
    });
  }, [isActive, format, quality, currentFacingMode]);

  return {
    isActive,
    isSupported,
    error,
    isLoading,
    currentFacingMode,
    videoRef,
    canvasRef,
    startCamera,
    stopCamera,
    switchCamera,
    retry,
    capturePhoto,
  };
};
