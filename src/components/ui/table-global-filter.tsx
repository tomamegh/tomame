import React from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "./input-group";
import { SearchIcon } from "lucide-react";

const TableGlobalFilter = ({...props}: React.ComponentProps<typeof InputGroupInput>) => {
  return (
    <InputGroup className="rounded-lg shadow-none h-10 bg-neutral-100">
      <InputGroupAddon>
        <SearchIcon className="size-4 text-stone-400 pointer-events-none" />
      </InputGroupAddon>
      <InputGroupInput {...props} type="search" />
    </InputGroup>
  );
};

export default TableGlobalFilter;
