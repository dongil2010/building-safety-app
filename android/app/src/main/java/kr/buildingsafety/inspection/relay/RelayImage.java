package kr.buildingsafety.inspection.relay;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.media.ExifInterface;
import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.File;

/**
 * 받은 원본 사진을 결함 사진 규격으로 줄인다: 가운데 4:3 자르기 → 2000×1500, JPEG 85%.
 * photo-capture.html 의 compressPhoto43 과 같은 규칙(세로 사진도 가로 4:3 으로 잘림). EXIF 회전을 먼저 반영.
 */
public final class RelayImage {
    public static final int TARGET_W = 2000;
    public static final int QUALITY = 85;

    private RelayImage() { }

    public static String toDataUrl(File file) {
        byte[] jpeg = toJpeg43(file, TARGET_W, QUALITY);
        if (jpeg == null) return null;
        return "data:image/jpeg;base64," + Base64.encodeToString(jpeg, Base64.NO_WRAP);
    }

    public static byte[] toJpeg43(File file, int targetW, int quality) {
        Bitmap src = null;
        Bitmap out = null;
        try {
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(file.getAbsolutePath(), bounds);
            if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
            int sample = 1;
            while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= targetW) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            src = BitmapFactory.decodeFile(file.getAbsolutePath(), opts);
            if (src == null) return null;
            int rot = exifRotation(file);
            if (rot != 0) {
                Matrix m = new Matrix();
                m.postRotate(rot);
                Bitmap r = Bitmap.createBitmap(src, 0, 0, src.getWidth(), src.getHeight(), m, true);
                if (r != src) { src.recycle(); src = r; }
            }
            int w = src.getWidth(), h = src.getHeight();
            int targetH = Math.round(targetW * 3f / 4f);
            int cropX = 0, cropY = 0, cropW = w, cropH = h;
            if ((float) w / h > 4f / 3f) {
                cropW = Math.round(h * 4f / 3f);
                cropX = Math.round((w - cropW) / 2f);
            } else {
                cropH = Math.round(w * 3f / 4f);
                cropY = Math.round((h - cropH) / 2f);
            }
            out = Bitmap.createBitmap(targetW, targetH, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(out);
            canvas.drawColor(0xFFFFFFFF);
            Paint p = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
            canvas.drawBitmap(src, new Rect(cropX, cropY, cropX + cropW, cropY + cropH), new Rect(0, 0, targetW, targetH), p);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            out.compress(Bitmap.CompressFormat.JPEG, quality, bos);
            return bos.toByteArray();
        } catch (Throwable t) {
            return null;
        } finally {
            if (src != null) src.recycle();
            if (out != null) out.recycle();
        }
    }

    private static int exifRotation(File file) {
        try {
            ExifInterface exif = new ExifInterface(file.getAbsolutePath());
            int o = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            if (o == ExifInterface.ORIENTATION_ROTATE_90) return 90;
            if (o == ExifInterface.ORIENTATION_ROTATE_180) return 180;
            if (o == ExifInterface.ORIENTATION_ROTATE_270) return 270;
        } catch (Exception ignored) { }
        return 0;
    }
}
