import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';
import { format } from "date-fns";

interface Consult {
  created_at: string;
  weight_kg?: number | null;
  weight_lb?: number | null;
}

interface WeightHistoryChartProps {
  consults: Consult[];
  weightUnit: 'kg' | 'lb';
  onWeightUnitChange: (unit: 'kg' | 'lb') => void;
}

export function WeightHistoryChart({ consults, weightUnit, onWeightUnitChange }: WeightHistoryChartProps) {
  const getWeightChartData = () => {
    return consults
      .filter(c => c.weight_kg || c.weight_lb)
      .reverse()
      .map(c => ({
        date: format(new Date(c.created_at), 'MMM dd'),
        weight: weightUnit === 'kg' ? c.weight_kg : c.weight_lb,
        fullDate: format(new Date(c.created_at), 'MMM dd, yyyy')
      }));
  };

  const chartData = getWeightChartData();

  if (chartData.length === 0) return null;

  return (
    <Card className="border-border/50 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-col xs:flex-row xs:items-center xs:justify-between gap-3">
          <div>
            <CardTitle className="text-lg md:text-xl flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Weight History
            </CardTitle>
            <CardDescription className="text-xs md:text-sm">Track weight changes over time</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant={weightUnit === 'kg' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onWeightUnitChange('kg')}
              className="h-8 text-xs"
            >
              kg
            </Button>
            <Button
              variant={weightUnit === 'lb' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onWeightUnitChange('lb')}
              className="h-8 text-xs"
            >
              lb
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 md:p-6 pt-0">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              tick={{ fontSize: 12 }}
              label={{ value: weightUnit, angle: -90, position: 'insideLeft' }}
            />
            <ChartTooltip 
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="bg-background border rounded-lg p-2 shadow-lg">
                      <p className="text-sm font-medium">{payload[0].payload.fullDate}</p>
                      <p className="text-sm text-primary">
                        {payload[0].value} {weightUnit}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line 
              type="monotone" 
              dataKey="weight" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              dot={{ fill: 'hsl(var(--primary))' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
