import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon, BarChart3, Download, RefreshCw, Clock, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
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
  const [updatingSheet, setUpdatingSheet] = React.useState(false);
  const [showResults, setShowResults] = React.useState(false);
  const [productData, setProductData] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadingProgress, setLoadingProgress] = React.useState(0);
  const [currentStatus, setCurrentStatus] = React.useState("");
  const [processingStats, setProcessingStats] = React.useState({
    totalProducts: 0,
    processedProducts: 0,
    totalVariants: 0,
    estimatedTime: 0,
    startTime: null as Date | null,
    currentPhase: "idle" as "idle" | "fetching_products" | "fetching_sales" | "processing" | "complete",
  });
  const [abortController, setAbortController] = React.useState<AbortController | null>(null);

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      productId: "",
      startDate: (() => {
        const d = new Date();
        d.setDate(d.getDate() - 90);
        return d;
      })(),
      endDate: new Date(),
    },
  });

  // Real-time progress tracking with timeout protection
  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    let timeoutId: NodeJS.Timeout;

    if (loading) {
      const startTime = Date.now();

      interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const elapsedSeconds = elapsed / 1000;

        // Update processing time
        setProcessingStats(prev => ({
          ...prev,
          startTime: prev.startTime || new Date(startTime)
        }));

        // Progressive status updates based on time elapsed
        if (elapsedSeconds > 30 && processingStats.currentPhase === "fetching_products") {
          setCurrentStatus("Fetching products... This may take a while for large datasets");
        } else if (elapsedSeconds > 60 && processingStats.currentPhase === "fetching_sales") {
          setCurrentStatus("Analyzing sales data across date range...");
        } else if (elapsedSeconds > 90) {
          setCurrentStatus("Processing large dataset, almost complete...");
        }
      }, 1000);

      // Safety timeout - 5 minutes max
      timeoutId = setTimeout(() => {
        if (loading && abortController) {
          abortController.abort();
          setLoading(false);
          setLoadingProgress(0);
          toast({
            title: "Request Timeout",
            description: "The request took too long. Please try with fewer products or a shorter date range.",
            variant: "destructive",
          });
        }
      }, 300000); // 5 minutes
    }

    return () => {
      if (interval) clearInterval(interval);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [loading, processingStats.currentPhase, abortController]);

  const estimateProcessingTime = (productCount: number) => {
    // More realistic estimation based on API performance
    const baseTime = 5;
    const timePerProduct = 0.8; // seconds per product
    const batchOverhead = Math.ceil(productCount / 5) * 2; // batch processing overhead
    return Math.round(baseTime + (productCount * timePerProduct) + batchOverhead);
  };

  const cancelRequest = () => {
    if (abortController) {
      abortController.abort();
      setLoading(false);
      setLoadingProgress(0);
      setCurrentStatus("");
      toast({
        title: "Request Cancelled",
        description: "The analytics request has been cancelled.",
      });
    }
  };

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    // Create new abort controller for this request
    const controller = new AbortController();
    setAbortController(controller);

    setLoading(true);
    const startTime = new Date();

    // Parse all product IDs without limit
    const productIds = data.productId
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    const totalProducts = productIds.length;
    const estimatedTime = estimateProcessingTime(totalProducts);

    setProcessingStats({
      totalProducts,
      processedProducts: 0,
      totalVariants: 0,
      estimatedTime,
      startTime,
      currentPhase: "fetching_products",
    });

    setShowResults(false);
    setProductData([]);
    setLoadingProgress(10);
    setCurrentStatus(`Preparing to fetch ${totalProducts} products...`);

    toast({
      title: "Analytics Query Submitted",
      description: `Processing ${totalProducts} product(s) from ${format(
        data.startDate,
        "PPP"
      )} to ${format(data.endDate, "PPP")}. Estimated time: ${estimatedTime}s`,
    });

    try {
      const startDate = format(data.startDate, "yyyy-MM-dd");
      const endDate = format(data.endDate, "yyyy-MM-dd");

      // Update status for product fetching phase
      setCurrentStatus("Fetching product information...");
      setLoadingProgress(20);
      setProcessingStats(prev => ({ ...prev, currentPhase: "fetching_products" }));

      // Build query string for all product IDs
      const query = productIds
        .map((id) => `product_id=gid://shopify/Product/${id}`)
        .join("&");

      const url = `${backendApi}/product-sales?${query}&start_date=${startDate}&end_date=${endDate}`;

      // Update status for sales data phase
      setCurrentStatus("Analyzing sales data and order history...");
      setLoadingProgress(40);
      setProcessingStats(prev => ({ ...prev, currentPhase: "fetching_sales" }));

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      // Update status for processing phase
      setCurrentStatus("Processing and organizing results...");
      setLoadingProgress(80);
      setProcessingStats(prev => ({ ...prev, currentPhase: "processing" }));

      const result = await response.json();

      // Final processing
      setCurrentStatus("Finalizing results...");
      setLoadingProgress(95);

      // Small delay to show completion
      await new Promise(resolve => setTimeout(resolve, 500));

      // Complete the progress
      setLoadingProgress(100);
      setCurrentStatus("Complete!");

      setProductData(result || []);
      setShowResults(true);

      const endTime = new Date();
      const actualTime = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

      setProcessingStats(prev => ({
        ...prev,
        processedProducts: totalProducts,
        totalVariants: result?.length || 0,
        currentPhase: "complete",
      }));

      toast({
        title: "Data Retrieved Successfully!",
        description: `Processed ${totalProducts} products (${result?.length || 0} variants) in ${actualTime}s`,
      });

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was cancelled, don't show error
        return;
      }

      console.error('Fetch error:', error);
      setCurrentStatus("Error occurred during processing");
      toast({
        title: "Error fetching data",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      setShowResults(false);
    } finally {
      setLoading(false);
      setLoadingProgress(0);
      setCurrentStatus("");
      setAbortController(null);
    }
  }

  const downloadCSV = () => {
    if (productData.length === 0) {
      toast({
        title: "No data to download",
        description: "Please run a query first to get data.",
        variant: "destructive",
      });
      return;
    }

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
          escapeCSV(row.netSales?.toFixed(2) || "0.00"),
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `analytics-data-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast({
      title: "CSV Downloaded",
      description: `Successfully downloaded data for ${productData.length} variants`,
    });
  };

  const updateGoogleSheet = async () => {
    if (productData.length === 0) {
      toast({
        title: "No data to update",
        description: "Please run a query first to get data.",
        variant: "destructive",
      });
      return;
    }

    setUpdatingSheet(true); // start loading
    const url = `${backendApi}/update-googlesheet`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(productData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      toast({
        title: "Google Sheet Updated",
        description: "Successfully updated the Google Sheet with current data.",
      });
    } catch (error) {
      console.error(error);
      toast({
        title: "Error updating Google Sheet",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    } finally {
      setUpdatingSheet(false); // stop loading
    }
  };

  const clearResults = () => {
    setShowResults(false);
    setProductData([]);
    setProcessingStats({
      totalProducts: 0,
      processedProducts: 0,
      totalVariants: 0,
      estimatedTime: 0,
      startTime: null,
      currentPhase: "idle",
    });
    form.reset({
      productId: "",
      startDate: (() => {
        const d = new Date();
        d.setDate(d.getDate() - 90);
        return d;
      })(),
      endDate: new Date(),
    });
  };

  const getTotalSales = () => {
    return productData.reduce((sum, item) => sum + (item.netSales || 0), 0);
  };

  const getTotalItemsSold = () => {
    return productData.reduce((sum, item) => sum + (item.netItemsSold || 0), 0);
  };

  const getUniqueProducts = () => {
    return new Set(productData.map(item => item.productTitle)).size;
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold text-dashboard-header">
              Analytics-Matching Sales Dashboard
            </h1>
          </div>
          <p className="text-dashboard-subtitle">
            Data that matches Shopify Analytics exactly! Process unlimited products with real-time progress tracking.
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
                      <FormLabel className="text-base font-medium">Product IDs</FormLabel>
                      <FormControl>
                        <textarea
                          {...field}
                          placeholder="Add unlimited products (comma-separated), e.g: 14968509825348, 14800375185732, 15123456789012, ..."
                          className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
                          disabled={loading}
                        />
                      </FormControl>
                      <div className="text-sm text-muted-foreground">
                        {field.value && field.value.split(',').filter(Boolean).length > 0 && (
                          <Badge variant="outline" className="mt-2">
                            {field.value.split(',').filter(Boolean).length} products to process
                          </Badge>
                        )}
                      </div>
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
                                disabled={loading}
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
                                disabled={loading}
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

                <div className="flex gap-4">
                  <Button
                    type="submit"
                    className="h-12 px-8 bg-primary hover:bg-primary/90 flex-1 md:flex-initial"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      "Get Analytics-Matching Data"
                    )}
                  </Button>

                  {loading && (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 px-6"
                      onClick={cancelRequest}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        {/* Enhanced Loading Progress */}
        {loading && (
          <Card className="shadow-lg mt-6">
            <CardContent className="p-6">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">Processing Your Request</h3>
                    <p className="text-sm text-muted-foreground">
                      {currentStatus || `Processing ${processingStats.totalProducts} products...`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-50">
                      <Clock className="mr-1 h-3 w-3" />
                      Est. {processingStats.estimatedTime}s
                    </Badge>
                    {processingStats.currentPhase !== "idle" && (
                      <Badge
                        variant={processingStats.currentPhase === "complete" ? "default" : "secondary"}
                        className={processingStats.currentPhase === "complete" ? "bg-green-100 text-green-800" : ""}
                      >
                        {processingStats.currentPhase.replace("_", " ")}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress</span>
                    <span>{Math.round(loadingProgress)}%</span>
                  </div>
                  <Progress value={loadingProgress} className="w-full h-2" />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2 p-3 rounded-md bg-blue-50">
                    <BarChart3 className="h-4 w-4 text-blue-600" />
                    <div>
                      <div className="font-medium">Products</div>
                      <div className="text-xs text-muted-foreground">{processingStats.totalProducts}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-md bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <div>
                      <div className="font-medium">Progress</div>
                      <div className="text-xs text-muted-foreground">{Math.round(loadingProgress)}%</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-md bg-orange-50">
                    <Clock className="h-4 w-4 text-orange-600" />
                    <div>
                      <div className="font-medium">Elapsed</div>
                      <div className="text-xs text-muted-foreground">
                        {processingStats.startTime &&
                          `${Math.round((new Date().getTime() - processingStats.startTime.getTime()) / 1000)}s`
                        }
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-md bg-purple-50">
                    <AlertCircle className="h-4 w-4 text-purple-600" />
                    <div>
                      <div className="font-medium">Status</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {processingStats.currentPhase.replace("_", " ")}
                      </div>
                    </div>
                  </div>
                </div>

                {processingStats.totalProducts > 50 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="flex items-center gap-2 text-amber-800">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm font-medium">Large Dataset Processing</span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                      Processing {processingStats.totalProducts} products may take several minutes.
                      The system will automatically handle rate limiting and batch processing.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Results Table */}
        {showResults && (
          <Card className="shadow-lg mt-8">
            <CardContent className="p-8">
              <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
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
                  <Button
                    onClick={updateGoogleSheet}
                    variant="outline"
                    disabled={updatingSheet}
                  >
                    {updatingSheet ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...
                      </>
                    ) : (
                      "Update CSV"
                    )}
                  </Button>
                </div>
              </div>

              {/* Enhanced Summary Stats */}
              {productData.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm font-medium text-muted-foreground">Unique Products</div>
                      <div className="text-2xl font-bold">{getUniqueProducts()}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm font-medium text-muted-foreground">Total Variants</div>
                      <div className="text-2xl font-bold">{productData.length}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm font-medium text-muted-foreground">Total Items Sold</div>
                      <div className="text-2xl font-bold">{getTotalItemsSold().toLocaleString()}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm font-medium text-muted-foreground">Total Sales</div>
                      <div className="text-2xl font-bold">${getTotalSales().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <div className="text-sm font-medium text-muted-foreground">Avg Sale/Item</div>
                      <div className="text-2xl font-bold">
                        ${getTotalItemsSold() > 0 ? (getTotalSales() / getTotalItemsSold()).toFixed(2) : "0.00"}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

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
                    {productData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-muted-foreground">No data found for the selected products and date range.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      productData.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{item.productTitle}</TableCell>
                          <TableCell>{item.variantTitle}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.sku || "N/A"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {item.netItemsSold?.toLocaleString() || 0}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ${item.netSales?.toFixed(2) || "0.00"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
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