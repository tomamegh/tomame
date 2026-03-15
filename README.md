# Adding Support for a New Platform

## Files to Change

1. **Create platform category map**
   - `src/config/categories/<platform>.ts`
   - Maps platform-specific category strings to `TomameCategory` enum values

2. **Export category map**
   - `src/config/categories/index.ts`
   - Add export for the new category map

3. **Create platform scraper**
   - `src/features/extraction/scrapers/<platform>.ts`
   - Extends `PlatformScraper`, implements `scrape()` and `extract()` methods
   - Uses the category map to convert platform categories to `TomameCategory`

4. **Register scraper**
   - `src/features/extraction/scrapers/registry.ts`
   - Add the new scraper instance to the registry array

5. **Add tests**
   - `src/features/extraction/scrapers/__tests__/<platform>.test.ts` - test file
   - `src/features/extraction/scrapers/__tests__/fixtures/<platform>-<product>.html` - HTML fixture
   - Use `fetch-fixture.ts` script to capture real product pages
