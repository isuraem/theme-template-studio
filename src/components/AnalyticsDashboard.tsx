import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, BarChart3, Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/hooks/use-toast";

const backendApi = import.meta.env.VITE_BACKEND_API;

const FormSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  startDate: z.date({ required_error: "Start date is required" }),
  endDate: z.date({ required_error: "End date is required" }),
});

const AnalyticsDashboard = () => {
  const [showResults, setShowResults] = React.useState(false);
  const [productData, setProductData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      productId: "9525756756292",
      startDate: new Date("2025-06-20"),
      endDate: new Date(),
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    setLoading(true);
    toast({
      title: "Analytics Query Submitted",
      description: `Fetching data for Product ID: ${data.productId} from ${format(
        data.startDate,
        "PPP"
      )} to ${format(data.endDate, "PPP")}`,
    });

    try {
      const productId = data.productId;
      const startDate = format(data.startDate, "yyyy-MM-dd");
      const endDate = format(data.endDate, "yyyy-MM-dd");
      const url = `/api/product-sales?product_id=gid://shopify/Product/${productId}&start_date=${startDate}&end_date=${endDate}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch product sales");
      const result = await response.json();
      setProductData(result || []);
      setShowResults(true);
    } catch (error) {
      toast({
        title: "Error fetching data",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      setShowResults(false);
    } finally {
      setLoading(false);
    }
  }

  // ✅ FIXED CSV GENERATION FOR EXCEL
  const downloadCSV = () => {
    const headers = [
      "Product Title",
      "Product Variant Title",
      "Product Variant SKU",
      "Net Items Sold",
      "Net Sales",
    ];

    const escapeCSV = (value: any) => {
      if (value === null || value === undefined) return '""';
      const str = value.toString();
      return `"${str.replace(/"/g, '""')}"`;
    };

    const csvContent = [
      headers.map(escapeCSV).join(","),
      ...productData.map((row) =>
        [
          escapeCSV(row.productTitle),
          escapeCSV(row.variantTitle),
          escapeCSV(row.sku),
          escapeCSV(row.netItemsSold),
          escapeCSV(row.netSales.toFixed(2)),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `analytics-data-${format(new Date(), "yyyy-MM-dd")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearResults = () => {
    setShowResults(false);
    setProductData([]);
    form.reset({
      productId: "9525756756292",
      startDate: new Date("2025-06-20"),
      endDate: new Date(),
    });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold text-dashboard-header">
              Analytics-Matching Sales Dashboard
            </h1>
          </div>
          <p className="text-dashboard-subtitle">
            Data that matches Shopify Analytics exactly!
          </p>
        </div>

        {/* Form Card */}
        <Card className="shadow-lg">
          <CardContent className="p-8">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Product ID</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter numeric product ID"
                          {...field}
                          className="h-12"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Start Date */}
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "h-12 pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value
                                  ? format(field.value, "MM/dd/yyyy")
                                  : "Pick a date"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* End Date */}
                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "h-12 pl-3 text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                {field.value
                                  ? format(field.value, "MM/dd/yyyy")
                                  : "Pick a date"}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarComponent
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button
                  type="submit"
                  className="h-12 px-6 bg-primary hover:bg-primary/90"
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Get Analytics-Matching Data"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Results Table */}
        {showResults && (
          <Card className="shadow-lg mt-8">
            <CardContent className="p-8">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold mb-2">
                    Analytics Results
                  </h2>
                  <p className="text-dashboard-subtitle">
                    Product performance data matching your query
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button onClick={clearResults} variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" /> Clear Results
                  </Button>
                  <Button onClick={downloadCSV} variant="outline">
                    <Download className="mr-2 h-4 w-4" /> Download CSV
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product Title</TableHead>
                      <TableHead>Product Variant Title</TableHead>
                      <TableHead>Product Variant SKU</TableHead>
                      <TableHead className="text-right">
                        Net Items Sold
                      </TableHead>
                      <TableHead className="text-right">Net Sales</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productData.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.productTitle}</TableCell>
                        <TableCell>{item.variantTitle}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.sku}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.netItemsSold}
                        </TableCell>
                        <TableCell className="text-right">
                          ${item.netSales.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
