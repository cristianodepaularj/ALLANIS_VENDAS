import React, { useState, useEffect } from 'react';
import { Search, Filter, ChevronDown, ChevronRight, User, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

interface Installment {
    id: string;
    sale_id: string;
    installment_number: number;
    due_date: string;
    amount: number;
    status: 'pending' | 'paid' | 'overdue';
    sale: {
        client: {
            name: string;
        };
    };
}

interface ClientGroup {
    clientId: string;
    clientName: string;
    installments: Installment[];
    totalPending: number;
    totalOverdue: number;
}

export const Installments: React.FC = () => {
    const { user } = useAuth();
    const [installments, setInstallments] = useState<Installment[]>([]);
    const [clientGroups, setClientGroups] = useState<ClientGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'paid' | 'overdue'>('all');
    const [viewMode, setViewMode] = useState<'all' | 'today'>('all');
    const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedInstallment, setSelectedInstallment] = useState<{ id: string, amount: number, clientName: string } | null>(null);
    const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [paymentMethod, setPaymentMethod] = useState('money');

    useEffect(() => {
        fetchInstallments();
    }, []);

    useEffect(() => {
        groupInstallments();
    }, [installments, searchTerm, statusFilter, viewMode]);

    const fetchInstallments = async () => {
        try {
            const { data, error } = await supabase
                .from('installments')
                .select(`
                    *,
                    sale:sales (
                        client:clients (
                            id,
                            name
                        )
                    )
                `)
                .order('due_date');

            if (error) throw error;
            if (data) setInstallments(data);
        } catch (error) {
            console.error('Error fetching installments:', error);
        } finally {
            setLoading(false);
        }
    };

    const groupInstallments = () => {
        const groups: { [key: string]: ClientGroup } = {};
        const todayStr = format(new Date(), 'yyyy-MM-dd');

        installments.forEach(inst => {
            // Filter logic
            const matchesSearch = inst.sale.client.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'all' || inst.status === statusFilter;

            let matchesDate = true;
            if (viewMode === 'today') {
                const dueDateStr = format(new Date(inst.due_date), 'yyyy-MM-dd');
                matchesDate = dueDateStr === todayStr;
            }

            if (matchesSearch && matchesStatus && matchesDate) {
                const clientId = inst.sale.client.name;

                if (!groups[clientId]) {
                    groups[clientId] = {
                        clientId: clientId,
                        clientName: inst.sale.client.name,
                        installments: [],
                        totalPending: 0,
                        totalOverdue: 0
                    };
                }

                groups[clientId].installments.push(inst);

                if (inst.status === 'pending') {
                    groups[clientId].totalPending += inst.amount;
                } else if (inst.status === 'overdue') {
                    groups[clientId].totalOverdue += inst.amount;
                }
            }
        });

        setClientGroups(Object.values(groups).sort((a, b) => a.clientName.localeCompare(b.clientName)));
    };

    const toggleClient = (clientName: string) => {
        const newExpanded = new Set(expandedClients);
        if (newExpanded.has(clientName)) {
            newExpanded.delete(clientName);
        } else {
            newExpanded.add(clientName);
        }
        setExpandedClients(newExpanded);
    };

    const openPaymentModal = (id: string, amount: number, clientName: string) => {
        setSelectedInstallment({ id, amount, clientName });
        setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
        setPaymentMethod('money');
        setShowPaymentModal(true);
    };

    const handleConfirmPayment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedInstallment) return;

        try {
            const { error } = await supabase
                .from('installments')
                .update({ status: 'paid' })
                .eq('id', selectedInstallment.id);

            if (error) throw error;

            // Register in Cash Flow
            if (user) {
                const { data: register } = await supabase
                    .from('cash_registers')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('status', 'open')
                    .single();

                if (register) {
                    // Format description with payment method
                    const methodLabel = {
                        money: 'Dinheiro',
                        pix: 'PIX',
                        debit: 'Débito',
                        credit: 'Crédito'
                    }[paymentMethod] || paymentMethod;

                    // Create timestamp combining selected date with current time
                    const now = new Date();
                    const [year, month, day] = paymentDate.split('-').map(Number);
                    const timestamp = new Date(year, month - 1, day, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();

                    await supabase.from('cash_transactions').insert([{
                        register_id: register.id,
                        installment_id: selectedInstallment.id,
                        description: `Recebimento Parcela - ${selectedInstallment.clientName} - ${methodLabel}`,
                        amount: selectedInstallment.amount,
                        type: 'installment_payment',
                        created_at: timestamp
                    }]);
                }
            }

            setShowPaymentModal(false);
            setSelectedInstallment(null);
            fetchInstallments();
        } catch (error) {
            console.error('Error paying installment:', error);
            alert('Erro ao pagar parcela');
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'paid': return 'bg-green-100 text-green-800';
            case 'overdue': return 'bg-red-100 text-red-800';
            default: return 'bg-yellow-100 text-yellow-800';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'paid': return 'Pago';
            case 'overdue': return 'Atrasado';
            default: return 'Pendente';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900">Gestão de Parcelas</h1>
                <div className="flex bg-gray-200 rounded-lg p-1">
                    <button
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'all' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                        onClick={() => setViewMode('all')}
                    >
                        Todas
                    </button>
                    <button
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'today' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-900'}`}
                        onClick={() => setViewMode('today')}
                    >
                        Vencimentos do Dia
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar por cliente..."
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Filter className="h-5 w-5 text-gray-400" />
                        <select
                            className="border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value as any)}
                        >
                            <option value="all">Todos os Status</option>
                            <option value="pending">Pendentes</option>
                            <option value="overdue">Atrasadas</option>
                            <option value="paid">Pagas</option>
                        </select>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">Carregando...</div>
                    ) : clientGroups.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">Nenhuma parcela encontrada</div>
                    ) : (
                        <div className="divide-y divide-gray-200">
                            {clientGroups.map(group => (
                                <div key={group.clientId} className="bg-white">
                                    <div
                                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                                        onClick={() => toggleClient(group.clientId)}
                                    >
                                        <div className="flex items-center gap-3">
                                            {expandedClients.has(group.clientId) ? (
                                                <ChevronDown className="h-5 w-5 text-gray-400" />
                                            ) : (
                                                <ChevronRight className="h-5 w-5 text-gray-400" />
                                            )}
                                            <div className="h-10 w-10 bg-blue-100 rounded-full flex items-center justify-center">
                                                <User className="h-5 w-5 text-blue-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-medium text-gray-900">{group.clientName}</h3>
                                                <div className="text-sm text-gray-500">
                                                    {group.installments.length} parcelas
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-1">
                                            {group.totalOverdue > 0 && (
                                                <span className="text-sm font-medium text-red-600">
                                                    Atrasado: R$ {group.totalOverdue.toFixed(2)}
                                                </span>
                                            )}
                                            {group.totalPending > 0 && (
                                                <span className="text-sm font-medium text-yellow-600">
                                                    Pendente: R$ {group.totalPending.toFixed(2)}
                                                </span>
                                            )}
                                            {group.totalOverdue === 0 && group.totalPending === 0 && (
                                                <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                                                    <CheckCircle className="h-4 w-4" />
                                                    Tudo pago
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {expandedClients.has(group.clientId) && (
                                        <div className="bg-gray-50 border-t border-gray-100">
                                            <table className="w-full">
                                                <thead className="bg-gray-100">
                                                    <tr>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vencimento</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parcela</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-200">
                                                    {group.installments.map((installment) => (
                                                        <tr key={installment.id} className="hover:bg-gray-100">
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                {format(new Date(installment.due_date), 'dd/MM/yyyy')}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                {installment.installment_number}ª
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                R$ {installment.amount.toFixed(2)}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap">
                                                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(installment.status)}`}>
                                                                    {getStatusLabel(installment.status)}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                {installment.status !== 'paid' && (
                                                                    <button
                                                                        onClick={() => openPaymentModal(installment.id, installment.amount, group.clientName)}
                                                                        className="text-blue-600 hover:text-blue-900 font-medium"
                                                                    >
                                                                        Receber
                                                                    </button>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Modal */}
            {showPaymentModal && selectedInstallment && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-6">
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Confirmar Recebimento</h3>
                        <p className="text-gray-600 mb-4">
                            Recebendo parcela de <strong>{selectedInstallment.clientName}</strong> no valor de <strong>R$ {selectedInstallment.amount.toFixed(2)}</strong>.
                        </p>

                        <form onSubmit={handleConfirmPayment} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Data do Pagamento
                                </label>
                                <input
                                    type="date"
                                    required
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={paymentDate}
                                    onChange={e => setPaymentDate(e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Forma de Pagamento
                                </label>
                                <select
                                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={paymentMethod}
                                    onChange={e => setPaymentMethod(e.target.value)}
                                >
                                    <option value="money">Dinheiro</option>
                                    <option value="pix">PIX</option>
                                    <option value="debit">Débito</option>
                                    <option value="credit">Crédito</option>
                                </select>
                            </div>

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowPaymentModal(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
