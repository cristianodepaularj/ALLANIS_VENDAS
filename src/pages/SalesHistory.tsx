import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { Calendar, Search, FileText, ChevronDown, ChevronUp } from 'lucide-react';

interface Sale {
    id: string;
    created_at: string;
    total_amount: number;
    payment_method: string;
    client: {
        name: string;
    };
    sale_items: {
        id: string;
        quantity: number;
        unit_price: number;
        product: {
            name: string;
            code: string;
        };
    }[];
}

export const SalesHistory: React.FC = () => {
    const [sales, setSales] = useState<Sale[]>([]);
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(format(new Date().setDate(new Date().getDate() - 30), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [expandedSale, setExpandedSale] = useState<string | null>(null);

    const fetchSales = async () => {
        setLoading(true);
        try {
            // Adjust end date to include the full day
            // Create dates treating the string as local time
            const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
            const startDateTime = new Date(startYear, startMonth - 1, startDay);
            startDateTime.setHours(0, 0, 0, 0);

            const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
            const endDateTime = new Date(endYear, endMonth - 1, endDay);
            endDateTime.setHours(23, 59, 59, 999);

            const { data, error } = await supabase
                .from('sales')
                .select(`
                    id,
                    created_at,
                    total_amount,
                    payment_method,
                    client:clients(name),
                    sale_items(
                        id,
                        quantity,
                        unit_price,
                        product:products(name, code)
                    )
                `)
                .gte('created_at', startDateTime.toISOString())
                .lte('created_at', endDateTime.toISOString())
                .order('created_at', { ascending: false });

            if (error) throw error;
            // Supabase returns arrays for joined relations sometimes, but we expect single objects for client
            // We cast here to match our interface, assuming the data structure is correct
            setSales((data as any) || []);
        } catch (error) {
            console.error('Error fetching sales:', error);
            alert('Erro ao buscar histórico de vendas');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSales();
    }, []);

    const toggleExpand = (saleId: string) => {
        setExpandedSale(expandedSale === saleId ? null : saleId);
    };

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value);
    };

    const formatPaymentMethod = (method: string) => {
        const methods: { [key: string]: string } = {
            'pix': 'PIX',
            'money': 'Dinheiro',
            'debit': 'Débito',
            'credit': 'Crédito',
        };
        if (method.startsWith('credit_card_')) {
            const installments = method.split('_')[2];
            return `Crédito (${installments})`;
        }
        return methods[method] || method;
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Histórico de Vendas</h1>
            </div>

            <div className="bg-white rounded-lg shadow p-4">
                <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="w-full sm:w-auto">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data Inicial</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full"
                            />
                        </div>
                    </div>
                    <div className="w-full sm:w-auto">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Data Final</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none w-full"
                            />
                        </div>
                    </div>
                    <button
                        onClick={fetchSales}
                        disabled={loading}
                        className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? 'Buscando...' : (
                            <>
                                <Search className="h-4 w-4" />
                                Filtrar
                            </>
                        )}
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Forma Pagto</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {sales.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                                        Nenhuma venda encontrada no período selecionado.
                                    </td>
                                </tr>
                            ) : (
                                sales.map((sale) => (
                                    <React.Fragment key={sale.id}>
                                        <tr className="hover:bg-gray-50 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {format(new Date(sale.created_at), 'dd/MM/yyyy HH:mm')}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {sale.client?.name || 'Cliente não identificado'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                {formatPaymentMethod(sale.payment_method)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                                                {formatCurrency(sale.total_amount)}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                <button
                                                    onClick={() => toggleExpand(sale.id)}
                                                    className="text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                                >
                                                    {expandedSale === sale.id ? (
                                                        <>
                                                            <ChevronUp className="h-4 w-4" />
                                                            Ocultar
                                                        </>
                                                    ) : (
                                                        <>
                                                            <ChevronDown className="h-4 w-4" />
                                                            Detalhes
                                                        </>
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                        {expandedSale === sale.id && (
                                            <tr className="bg-gray-50">
                                                <td colSpan={5} className="px-6 py-4">
                                                    <div className="text-sm text-gray-700">
                                                        <h4 className="font-medium mb-2 flex items-center gap-2">
                                                            <FileText className="h-4 w-4" />
                                                            Itens do Pedido
                                                        </h4>
                                                        <div className="bg-white border rounded-lg overflow-hidden">
                                                            <table className="min-w-full divide-y divide-gray-200">
                                                                <thead className="bg-gray-100">
                                                                    <tr>
                                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Produto</th>
                                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Qtd</th>
                                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Preço Unit.</th>
                                                                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Subtotal</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-200">
                                                                    {sale.sale_items.map((item) => (
                                                                        <tr key={item.id}>
                                                                            <td className="px-4 py-2 text-sm text-gray-900">{item.product?.name}</td>
                                                                            <td className="px-4 py-2 text-sm text-gray-900">{item.quantity}</td>
                                                                            <td className="px-4 py-2 text-sm text-gray-900">{formatCurrency(item.unit_price)}</td>
                                                                            <td className="px-4 py-2 text-sm text-gray-900">{formatCurrency(item.quantity * item.unit_price)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
