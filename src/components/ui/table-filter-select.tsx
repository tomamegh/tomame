import { Column } from "@tanstack/react-table";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import React from "react";

interface TableFilterProps<T, TValue> {
  placeholder?: string;
  column: Column<T, TValue>;
  items: {
    value: React.ComponentProps<typeof SelectItem>["value"];
    label: React.ReactNode;
  }[];
  renderItem?: (
    item: TableFilterProps<T, TValue>["items"][number],
    index?: number,
  ) => React.ReactNode;
}

const TableFilter = <T, TValue>({
  column,
  items,
  ...props
}: TableFilterProps<T, TValue>) => {
  const value = (column.getFilterValue() as string) || undefined;

  const handleValueChange = (v: string) => {
    column.setFilterValue(v === "" ? undefined : v);
  };
  return (
    <Select
      key={value ?? "__placeholder__"}
      onValueChange={handleValueChange}
      value={value}
    >
      <SelectTrigger className="w-fit">
        <SelectValue placeholder={props?.placeholder || "Select"} />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup>
          {items.map((item, idx) => (
            <SelectItem key={idx.toString()} value={item.value}>
              {props.renderItem ? props.renderItem(item, idx) : item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};

export default TableFilter;
