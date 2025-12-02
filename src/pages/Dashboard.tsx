import React, { useEffect, useState } from 'react';
import { DollarSign, Users, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export const Dashboard: React.FC = () => {
    const [stats, setStats] = useState({
        dailySales: 0,
        totalClients: 0,
        lowStockCount: 0,
    });
    const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchStats();
    }, []);

    const fetchStats = async () => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // 1. Daily Sales
            const { data: salesData } = await supabase
                .from('sales')
                .select('total_amount')
                .gte('created_at', today.toISOString());

            const dailySales = salesData?.reduce((sum, sale) => sum + sale.total_amount, 0) || 0;

            // 2. Total Clients
            const { count: clientCount } = await supabase
                .from('clients')
                .select('*', { count: 'exact', head: true });

            // 3. Low Stock
            const { data: productsData } = await supabase
                .from('products')
                .select('*')
                .order('stock_quantity');

            const lowStock = productsData?.filter(p => p.stock_quantity <= p.min_stock_threshold) || [];

            setStats({
                dailySales,
                totalClients: clientCount || 0,
                lowStockCount: lowStock.length,
            });
            setLowStockProducts(lowStock.slice(0, 5)); // Show top 5 low stock

        } catch (error) {
            console.error('Error fetching stats:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-lg shadow p-6 flex items-center">
                    <div className="p-3 rounded-full bg-green-100 text-green-600 mr-4">
                        <DollarSign className="h-8 w-8" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Vendas Hoje</p>
                        <p className="text-2xl font-bold text-gray-900">
                            R$ {stats.dailySales.toFixed(2)}
                        </p>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6 flex items-center">
                    <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
                        <Users className="h-8 w-8" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Total de Clientes</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.totalClients}</p>
                    </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6 flex items-center">
                    <div className="p-3 rounded-full bg-red-100 text-red-600 mr-4">
                        <AlertTriangle className="h-8 w-8" />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500 font-medium">Produtos Baixo Estoque</p>
                        <p className="text-2xl font-bold text-gray-900">{stats.lowStockCount}</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                    <h2 className="text-lg font-medium text-gray-900">Alertas de Estoque</h2>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Produto</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estoque Atual</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mínimo</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {lowStockProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-4 text-center text-sm text-gray-500">
                                        Nenhum alerta de estoque.
                                    </td>
                                </tr>
                            ) : (
                                lowStockProducts.map((product) => (
                                    <tr key={product.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {product.name}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {product.stock_quantity} {product.unit}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {product.min_stock_threshold}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                                Crítico
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
