/**
 * The car screens' components.
 *
 * `attachCovers` and `CarWithCover` live in `services/cars.service.ts`: the
 * cover read is a database call, which is the service's business, not a
 * component's.
 */
export { CarActionBar, type CarActionBarProps } from "./car-action-bar";
export { CarActions, type CarActionsProps } from "./car-actions";
export { CarCard, type CarCardProps } from "./car-card";
export { CarGallery, type CarGalleryProps } from "./car-gallery";
export { CarGrid, type CarGridProps } from "./car-grid";
export { CarLandedCostCard, type CarLandedCostCardProps } from "./car-landed-cost-card";
export { CarPriceBlock, type CarPriceBlockProps } from "./car-price-block";
export { CarSpecTable, type CarSpecTableProps } from "./car-spec-table";
export { CarsRail, type CarsRailProps } from "./cars-rail";
export {
  RIBBON_TONE_CLASS,
  accraDay,
  bodyTypeLabel,
  drivetrainLabel,
  fuelLabel,
  galleryOrder,
  isBuyable,
  shortTransmissionLabel,
  transmissionLabel,
  voyageRibbon,
  type CarRibbonTone,
  type CarVoyageRibbon,
} from "./labels";
