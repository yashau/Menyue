export const MENU_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const MENU_IMAGE_OUTPUT_LONG_EDGE = 1200;

export type MenuImageAspect = '4:3' | '1:1' | '16:9';
export const MENU_IMAGE_ASPECTS: Record<MenuImageAspect, number> = {
	'4:3': 4 / 3,
	'1:1': 1,
	'16:9': 16 / 9,
};

export type MenuImageCrop = {
	width: number;
	height: number;
	sourceWidth: number;
	sourceHeight: number;
	sourceX: number;
	sourceY: number;
};

/** Computes a cover crop; focal values are -1 (left/top) to 1 (right/bottom). */
export function menuImageCrop(
	imageWidth: number,
	imageHeight: number,
	aspect: MenuImageAspect,
	focalX = 0,
	focalY = 0,
): MenuImageCrop {
	const ratio = MENU_IMAGE_ASPECTS[aspect];
	const width = Math.max(1, Math.round(MENU_IMAGE_OUTPUT_LONG_EDGE));
	const height = Math.max(1, Math.round(width / ratio));
	const sourceRatio = imageWidth / imageHeight;
	const cropWidth = sourceRatio > ratio ? imageHeight * ratio : imageWidth;
	const cropHeight = sourceRatio > ratio ? imageHeight : imageWidth / ratio;
	const x = Math.max(0, Math.min(imageWidth - cropWidth, ((focalX + 1) / 2) * (imageWidth - cropWidth)));
	const y = Math.max(0, Math.min(imageHeight - cropHeight, ((focalY + 1) / 2) * (imageHeight - cropHeight)));
	return { width, height, sourceWidth: cropWidth, sourceHeight: cropHeight, sourceX: x, sourceY: y };
}

export function menuImageDimensions(aspect: MenuImageAspect) {
	const crop = menuImageCrop(1200, 1200, aspect);
	return { width: crop.width, height: crop.height };
}
