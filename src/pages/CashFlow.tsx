import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Unlock, FileText, FileSpreadsheet } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

interface CashRegister {
    id: string;
    opened_at: string;
    initial_balance: number;
    status: 'open' | 'closed';
    final_balance?: number;
}

interface Transaction {
    id: string;
    description: string;
    amount: number;
    type: 'sale' | 'installment_payment' | 'opening' | 'closing' | 'withdrawal' | 'deposit';
    created_at: string;
    sale_id?: string;
    sale?: {
        payment_method: string;
    };
}

export const CashFlow: React.FC = () => {
    const { user } = useAuth();
    const [register, setRegister] = useState<CashRegister | null>(null);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [initialBalance, setInitialBalance] = useState('');

    useEffect(() => {
        if (user) fetchCurrentRegister();
    }, [user]);

    // Auto-fix zero transactions (legacy bug)
    useEffect(() => {
        const zeroTransactions = transactions.filter(t => t.amount === 0 && t.type === 'sale' && t.sale_id);
        if (zeroTransactions.length > 0) {
            fixZeroTransactions(zeroTransactions);
        }
    }, [transactions]);

    const fixZeroTransactions = async (items: Transaction[]) => {
        let updated = false;
        for (const t of items) {
            if (!t.sale_id) continue;
            const { data: sale } = await supabase
                .from('sales')
                .select('total_amount')
                .eq('id', t.sale_id)
                .single();

            if (sale) {
                await supabase
                    .from('cash_transactions')
                    .update({ amount: sale.total_amount })
                    .eq('id', t.id);
                updated = true;
            }
        }
        if (updated && register) {
            fetchTransactions(register.id);
        }
    };

    const fetchCurrentRegister = async () => {
        setLoading(true);
        try {
            // Get open register for current user
            const { data: registers, error } = await supabase
                .from('cash_registers')
                .select('*')
                .eq('user_id', user?.id)
                .eq('status', 'open')
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "no rows found"

            if (registers) {
                setRegister(registers);
                fetchTransactions(registers.id);
            } else {
                setRegister(null);
                setTransactions([]);
            }
        } catch (error) {
            console.error('Error fetching register:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTransactions = async (registerId: string) => {
        const { data, error } = await supabase
            .from('cash_transactions')
            .select(`
                *,
                sale:sales (
                    payment_method
                )
            `)
            .eq('register_id', registerId)
            .order('created_at', { ascending: false });

        if (error) console.error('Error fetching transactions:', error);
        else setTransactions(data || []);
    };

    const handleOpenRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        try {
            const { data, error } = await supabase
                .from('cash_registers')
                .insert([{
                    user_id: user.id,
                    initial_balance: parseFloat(initialBalance),
                    status: 'open'
                }])
                .select()
                .single();

            if (error) throw error;

            // Record initial balance transaction
            await supabase.from('cash_transactions').insert([{
                register_id: data.id,
                description: 'Abertura de Caixa',
                amount: parseFloat(initialBalance),
                type: 'opening'
            }]);

            setRegister(data);
            fetchTransactions(data.id);
        } catch (error) {
            console.error('Error opening register:', error);
            alert('Erro ao abrir caixa');
        }
    };

    const handleCloseRegister = async () => {
        if (!register) return;
        if (!window.confirm('Tem certeza que deseja fechar o caixa?')) return;

        try {
            const { error } = await supabase
                .from('cash_registers')
                .update({
                    status: 'closed',
                    closed_at: new Date().toISOString(),
                    final_balance: calculateBalance()
                })
                .eq('id', register.id);

            if (error) throw error;

            // Record closing transaction
            await supabase.from('cash_transactions').insert([{
                register_id: register.id,
                description: 'Fechamento de Caixa',
                amount: calculateBalance(),
                type: 'closing'
            }]);

            setRegister(null);
            setTransactions([]);
        } catch (error) {
            console.error('Error closing register:', error);
            alert('Erro ao fechar caixa');
        }
    };

    const calculateBalance = () => {
        return transactions.reduce((acc, curr) => {
            if (curr.type === 'withdrawal') return acc - curr.amount;
            return acc + curr.amount;
        }, 0);
    };

    const getTransactionLabel = (type: string) => {
        switch (type) {
            case 'sale': return 'Venda';
            case 'installment_payment': return 'Recebimento';
            case 'opening': return 'Abertura';
            case 'closing': return 'Fechamento';
            case 'withdrawal': return 'Sangria';
            case 'deposit': return 'Suprimento';
            default: return type;
        }
    };

    const getTransactionColor = (type: string) => {
        switch (type) {
            case 'sale':
            case 'installment_payment':
            case 'opening':
            case 'deposit':
                return 'bg-green-100 text-green-800';
            case 'withdrawal':
            case 'closing':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const formatPaymentMethod = (method: string) => {
        const methods: { [key: string]: string } = {
            money: 'Dinheiro',
            pix: 'PIX',
            debit: 'Débito',
            credit: 'Crédito',
            credit_1x: 'Crédito (1x)',
            credit_2x: 'Crédito (2x)',
            credit_3x: 'Crédito (3x)',
            credit_4x: 'Crédito (4x)',
            credit_5x: 'Crédito (5x)',
            credit_6x: 'Crédito (6x)',
            credit_7x: 'Crédito (7x)',
            credit_8x: 'Crédito (8x)',
            credit_9x: 'Crédito (9x)',
            credit_10x: 'Crédito (10x)',
            credit_11x: 'Crédito (11x)',
            credit_12x: 'Crédito (12x)',
        };
        return methods[method] || method;
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="text-gray-500">Carregando...</div>
            </div>
        );
    }

    if (!register) {
        return (
            <div className="max-w-md mx-auto mt-10">
                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-200">
                    <h2 className="text-2xl font-bold text-center mb-6">Abrir Caixa</h2>
                    <form onSubmit={handleOpenRegister} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Saldo Inicial (R$)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                required
                                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                value={initialBalance}
                                onChange={e => setInitialBalance(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Abrir Caixa
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Controle de Caixa</h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => {
                            const doc = new jsPDF();
                            doc.text('Relatório de Caixa', 14, 15);
                            doc.text(`Saldo Atual: R$ ${calculateBalance().toFixed(2)}`, 14, 25);
                            autoTable(doc, {
                                head: [['Hora', 'Descrição', 'Tipo', 'Forma Pagto', 'Valor']],
                                body: transactions.map(t => [
                                    new Date(t.created_at).toLocaleTimeString(),
                                    t.description,
                                    getTransactionLabel(t.type),
                                    t.sale?.payment_method ? formatPaymentMethod(t.sale.payment_method) : '-',
                                    `R$ ${t.amount.toFixed(2)}`
                                ]),
                                startY: 30,
                            });
                            doc.save('caixa.pdf');
                        }}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
                    >
                        <FileText className="h-4 w-4 mr-2" />
                        PDF
                    </button>
                    <button
                        onClick={() => {
                            const ws = XLSX.utils.json_to_sheet(transactions.map(t => ({
                                Hora: new Date(t.created_at).toLocaleTimeString(),
                                Descrição: t.description,
                                Tipo: getTransactionLabel(t.type),
                                'Forma Pagto': t.sale?.payment_method ? formatPaymentMethod(t.sale.payment_method) : '-',
                                Valor: t.amount
                            })));
                            const wb = XLSX.utils.book_new();
                            XLSX.utils.book_append_sheet(wb, ws, "Caixa");
                            XLSX.writeFile(wb, "caixa.xlsx");
                        }}
                        className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                    >
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Excel
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm text-gray-500 mb-1">Saldo Inicial</p>
                    <p className="text-2xl font-bold text-gray-900">
                        R$ {register.initial_balance.toFixed(2)}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <p className="text-sm text-gray-500 mb-1">Saldo Atual</p>
                    <p className="text-3xl font-bold text-blue-600">
                        R$ {calculateBalance().toFixed(2)}
                    </p>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col justify-between">
                    <div>
                        <p className="text-sm text-gray-500 mb-1">Status</p>
                        <div className="flex items-center text-green-600 font-medium">
                            <Unlock className="h-4 w-4 mr-1" />
                            Aberto
                        </div>
                    </div>
                    <button
                        onClick={handleCloseRegister}
                        className="mt-4 w-full bg-red-100 text-red-700 py-2 rounded-lg hover:bg-red-200 transition-colors font-medium"
                    >
                        Fechar Caixa
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200">
                    <h3 className="font-bold text-gray-900">Movimentações do Dia</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hora</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Forma Pagto</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {transactions.map((transaction) => (
                                <tr key={transaction.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(transaction.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {transaction.description}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getTransactionColor(transaction.type)}`}>
                                            {getTransactionLabel(transaction.type)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {transaction.sale?.payment_method ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                                {formatPaymentMethod(transaction.sale.payment_method)}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${transaction.type === 'withdrawal' ? 'text-red-600' : 'text-green-600'
                                        }`}>
                                        {transaction.type === 'withdrawal' ? '-' : '+'}
                                        R$ {transaction.amount.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
