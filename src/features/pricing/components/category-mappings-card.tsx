"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CategoryMappingsDataTable } from "./category-mappings-table/data-table";

export function CategoryMappingsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Mappings</CardTitle>
        <CardDescription>
          Assign product categories to pricing groups.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CategoryMappingsDataTable />
      </CardContent>
    </Card>
  );
}
