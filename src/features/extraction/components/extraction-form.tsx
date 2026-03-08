"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ExtractionSchemaType,
  extractProductSchema,
} from "@/features/extraction/schema";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { LinkIcon, ScanSearchIcon } from "lucide-react";
import { Field } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { SUPPORTED_STORES } from "@/features/stores/services";

interface ExtractionFormProps {
  onSubmit: (url: string) => void;
  isLoading: boolean;
}

const ExtractionInput: React.FC<ExtractionFormProps> = ({
  isLoading,
  onSubmit,
}) => {
  const {
    handleSubmit,
    register,
    formState: { errors },
  } = useForm<ExtractionSchemaType>({
    resolver: zodResolver(extractProductSchema),
  });

  return (
    <div>
      <Field orientation={"horizontal"}>
        <InputGroup className="h-11">
          <InputGroupInput
            {...register("productUrl")}
            type="url"
            placeholder="https://amazon.com/dp/B09XYZ..."
            className={`soft-input`}
            disabled={isLoading}
            aria-invalid={!!errors.productUrl}
          />
          <InputGroupAddon>
            <LinkIcon className="size-4 text-stone-400" />
          </InputGroupAddon>
        </InputGroup>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          onClick={handleSubmit((data) => onSubmit(data.productUrl))}
          disabled={isLoading}
          className="shrink-0 gap-2"
        >
          {isLoading ? (
            <>
              <Spinner />
              Extracting...
            </>
          ) : (
            <>
              <ScanSearchIcon className="size-4" />
              Extract
            </>
          )}
        </Button>
      </Field>
      {errors.productUrl && (
        <p className="text-sm text-destructive" role="alert">
          {errors.productUrl.message}
        </p>
      )}
    </div>
  );
};

export function ExtractionForm({ onSubmit, isLoading }: ExtractionFormProps) {

  return (
    <Card className="rounded-2xl bg-white/80 backdrop-blur-sm">
      {/* Header */}
      <CardHeader>
        <CardTitle className="text-lg font-bold text-stone-800">
          Order Any Product
        </CardTitle>
        <CardDescription className="text-sm text-stone-500 mt-0.5">
          Paste a product link from any supported store and we&apos;ll handle
          the rest.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ExtractionInput onSubmit={onSubmit} isLoading={isLoading} />
      </CardContent>

      {/* Supported stores — live from DB */}
      <CardFooter className="flex-col items-start mt-2">
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2.5">
          Supported stores
        </p>
          <div className="flex flex-wrap gap-1.5">
            {SUPPORTED_STORES.map((store) => (
              <Badge
                key={store}
                variant="outline"
                className="text-xs text-stone-600 h-7"
              >
                {store}
              </Badge>
            ))}
          </div>
      </CardFooter>
    </Card>
  );
}
