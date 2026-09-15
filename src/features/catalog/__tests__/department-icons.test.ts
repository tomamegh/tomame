import { describe, expect, it } from "vitest";
import {
  Armchair,
  Baby,
  Barbell,
  BookOpen,
  Car,
  DeviceMobile,
  GameController,
  Headphones,
  Heartbeat,
  Laptop,
  PawPrint,
  Sparkle,
  SquaresFour,
  Storefront,
  Television,
  TShirt,
  Wrench,
} from "@phosphor-icons/react/ssr";

import { TomameCategory } from "@/config/categories";
import {
  DEPARTMENT_FALLBACK_ICON,
  departmentIcon,
} from "../components/department-icons";

/**
 * The resolver is a first-match-wins keyword scan, so the tests that matter are
 * the COLLISIONS: the labels that carry two rules' keywords and would land on
 * the wrong glyph if the order were shuffled. The plain cases are here too, but
 * they are the cheap half.
 */

describe("departmentIcon", () => {
  it("matches regardless of case or surrounding words", () => {
    expect(departmentIcon("ELECTRONICS")).toBe(Television);
    expect(departmentIcon("electronics")).toBe(Television);
    expect(departmentIcon("Car Electronics & Accessories")).toBe(Car);
  });

  it("maps the departments a customer is most likely to see", () => {
    expect(departmentIcon(TomameCategory.CELL_PHONES)).toBe(DeviceMobile);
    expect(departmentIcon(TomameCategory.COMPUTERS)).toBe(Laptop);
    expect(departmentIcon(TomameCategory.TV_VIDEO)).toBe(Television);
    expect(departmentIcon(TomameCategory.HEADPHONES)).toBe(Headphones);
    expect(departmentIcon(TomameCategory.HOME_KITCHEN)).toBe(Armchair);
    expect(departmentIcon(TomameCategory.BEAUTY)).toBe(Sparkle);
    expect(departmentIcon(TomameCategory.HAIRCARE)).toBe(Sparkle);
    expect(departmentIcon(TomameCategory.SKINCARE)).toBe(Sparkle);
    expect(departmentIcon(TomameCategory.CLOTHING_WOMEN)).toBe(TShirt);
    expect(departmentIcon(TomameCategory.SHOES_MEN)).toBe(TShirt);
    expect(departmentIcon(TomameCategory.BABY)).toBe(Baby);
    expect(departmentIcon(TomameCategory.TOOLS)).toBe(Wrench);
    expect(departmentIcon(TomameCategory.HEALTH_HOUSEHOLD)).toBe(Heartbeat);
    expect(departmentIcon(TomameCategory.SPORTS_OUTDOORS)).toBe(Barbell);
    expect(departmentIcon(TomameCategory.PET_SUPPLIES)).toBe(PawPrint);
    expect(departmentIcon(TomameCategory.BOOKS)).toBe(BookOpen);
    expect(departmentIcon(TomameCategory.AUTOMOTIVE)).toBe(Car);
    expect(departmentIcon(TomameCategory.VIDEO_GAMES)).toBe(GameController);
  });

  it("gives the synthetic 'All categories' pill its own glyph", () => {
    // The browse screen prepends this one during a search; it is not a shelf,
    // and it must not borrow a department's icon.
    expect(departmentIcon("All categories")).toBe(SquaresFour);
  });

  describe("labels that carry two rules' keywords", () => {
    it("reads 'Toys & Games' as children rather than as gaming", () => {
      expect(departmentIcon(TomameCategory.TOYS_GAMES)).toBe(Baby);
      expect(departmentIcon(TomameCategory.VIDEO_GAMES)).toBe(GameController);
    });

    it("reads kids' clothing as children rather than as fashion", () => {
      expect(departmentIcon(TomameCategory.KIDS_FASHION)).toBe(Baby);
      expect(departmentIcon(TomameCategory.CLOTHING_KIDS)).toBe(Baby);
      expect(departmentIcon(TomameCategory.SHOES_KIDS)).toBe(Baby);
    });

    it("reads 'Video Games' as gaming rather than as video", () => {
      expect(departmentIcon(TomameCategory.VIDEO_GAMES)).toBe(GameController);
      expect(departmentIcon(TomameCategory.CAMERA_PHOTO)).toBe(Television);
    });

    it("reads home improvement as a workshop rather than a living room", () => {
      expect(departmentIcon(TomameCategory.TOOLS)).toBe(Wrench);
      expect(departmentIcon(TomameCategory.HOME_IMPROVEMENT)).toBe(Wrench);
      expect(departmentIcon(TomameCategory.FURNITURE)).toBe(Armchair);
    });

    it("reads 'Smart Home' as electronics rather than as homeware", () => {
      expect(departmentIcon(TomameCategory.SMART_HOME)).toBe(Television);
    });

    it("reads 'Movies & TV' and 'Music' as media rather than as screens", () => {
      expect(departmentIcon(TomameCategory.MOVIES_TV)).toBe(BookOpen);
      expect(departmentIcon(TomameCategory.MUSIC)).toBe(BookOpen);
      expect(departmentIcon(TomameCategory.MUSICAL_INSTRUMENTS)).toBe(BookOpen);
    });

    it("reads 'Office Furniture' as an office rather than as homeware", () => {
      expect(departmentIcon(TomameCategory.OFFICE_FURNITURE)).toBe(BookOpen);
      expect(departmentIcon(TomameCategory.SCHOOL_SUPPLIES)).toBe(BookOpen);
    });

    it("never lets a '…Care' shelf become a car", () => {
      // "Hair Care", "Skin Care" and "Personal Care" all contain "car".
      expect(departmentIcon(TomameCategory.HAIRCARE)).not.toBe(Car);
      expect(departmentIcon(TomameCategory.SKINCARE)).not.toBe(Car);
      expect(departmentIcon(TomameCategory.PERSONAL_CARE)).not.toBe(Car);
      expect(departmentIcon(TomameCategory.CAR_CARE)).toBe(Car);
    });

    it("never lets 'All categories' become a pet shelf", () => {
      // "categories" carries "cat".
      expect(departmentIcon("All categories")).not.toBe(PawPrint);
    });
  });

  it("falls back to the shop front for anything it does not recognise", () => {
    expect(departmentIcon(TomameCategory.OTHER)).toBe(Storefront);
    expect(departmentIcon("Bicycle-powered thingamajigs")).toBe(Storefront);
    expect(departmentIcon("")).toBe(Storefront);
    expect(DEPARTMENT_FALLBACK_ICON).toBe(Storefront);
  });

  it("returns a component for every canonical category, recognised or not", () => {
    // The row must never have a hole in it: whatever the extraction pipeline
    // stamps on a product, the department it creates gets a glyph.
    for (const label of Object.values(TomameCategory)) {
      expect(typeof departmentIcon(label)).not.toBe("undefined");
    }
  });
});
