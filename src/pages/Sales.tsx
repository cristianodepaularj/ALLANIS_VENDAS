import React, { useState, useEffect } from 'react';
import { Search, ShoppingCart, Trash2, Plus, Minus, FileText, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import jsPDF from 'jspdf';

interface Product {
    id: string;
    name: string;
    code: string;
    price: number;
    stock_quantity: number;
}

interface Client {
    id: string;
    name: string;
}

interface CartItem extends Product {
    quantity: number;
}

export const Sales: React.FC = () => {
    const { user } = useAuth();
    const [products, setProducts] = useState<Product[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [selectedClient, setSelectedClient] = useState<string>('');
    const [searchTerm, setSearchTerm] = useState('');

    // Payment states
    const [paymentType, setPaymentType] = useState<'cash' | 'installment'>('cash');
    const [paymentMethod, setPaymentMethod] = useState('pix');
    const [installments, setInstallments] = useState<number>(2);
    const [amountPaid, setAmountPaid] = useState<number>(0);

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchProducts();
        fetchClients();
    }, []);

    const fetchProducts = async () => {
        const { data } = await supabase
            .from('products')
            .select('id, name, code, price, stock_quantity')
            .gt('stock_quantity', 0)
            .order('name');
        if (data) setProducts(data);
    };

    const fetchClients = async () => {
        const { data } = await supabase
            .from('clients')
            .select('id, name')
            .order('name');
        if (data) setClients(data);
    };

    const addToCart = (product: Product) => {
        setCart(current => {
            const existing = current.find(item => item.id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock_quantity) return current;
                return current.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
            }
            return [...current, { ...product, quantity: 1 }];
        });
    };

    const removeFromCart = (productId: string) => {
        setCart(current => current.filter(item => item.id !== productId));
    };

    const updateQuantity = (productId: string, delta: number) => {
        setCart(current => {
            return current.map(item => {
                if (item.id === productId) {
                    const newQuantity = item.quantity + delta;
                    if (newQuantity < 1) return item;
                    if (newQuantity > item.stock_quantity) return item;
                    return { ...item, quantity: newQuantity };
                }
                return item;
            });
        });
    };

    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const change = paymentMethod === 'money' && paymentType === 'cash' ? Math.max(0, amountPaid - total) : 0;

    const generateReceipt = (saleId: string) => {
        const doc = new jsPDF({
            format: 'a6',
            unit: 'mm'
        });

        const clientName = clients.find(c => c.id === selectedClient)?.name || 'Cliente';
        const date = new Date().toLocaleString('pt-BR');

        doc.setFontSize(12);
        doc.text('CUPOM NÃO FISCAL', 52.5, 10, { align: 'center' });

        doc.setFontSize(8);
        doc.text(`Data: ${date}`, 5, 20);
        doc.text(`Cliente: ${clientName}`, 5, 25);
        doc.text('------------------------------------------------', 5, 30);

        let y = 35;
        cart.forEach(item => {
            doc.text(`${item.name}`, 5, y);
            doc.text(`${item.quantity}x R$ ${item.price.toFixed(2)} = R$ ${(item.quantity * item.price).toFixed(2)}`, 5, y + 4);
            y += 10;
        });

        doc.text('------------------------------------------------', 5, y);
        y += 5;
        doc.setFontSize(10);
        doc.text(`TOTAL: R$ ${total.toFixed(2)}`, 5, y);

        if (paymentType === 'installment') {
            y += 5;
            doc.text(`Forma: Parcelado em ${installments}x`, 5, y);
        } else if (paymentMethod === 'money') {
            y += 5;
            doc.setFontSize(8);
            doc.text(`Pago: R$ ${amountPaid.toFixed(2)}`, 5, y);
            doc.text(`Troco: R$ ${change.toFixed(2)}`, 5, y + 4);
        } else {
            y += 5;
            doc.text(`Forma: ${paymentMethod.toUpperCase()}`, 5, y);
        }

        doc.save(`cupom_${saleId}.pdf`);
    };

    const handleCheckout = async () => {
        if (!selectedClient) {
            alert('Selecione um cliente');
            return;
        }
        if (cart.length === 0) {
            alert('Carrinho vazio');
            return;
        }
        if (paymentType === 'cash' && paymentMethod === 'money' && amountPaid < total) {
            alert('Valor pago insuficiente');
            return;
        }

        setLoading(true);
        try {
            // 1. Create Sale
            const { data: sale, error: saleError } = await supabase
                .from('sales')
                .insert([{
                    client_id: selectedClient,
                    user_id: user?.id,
                    total_amount: total,
                    payment_method: paymentType === 'installment' ? `credit_card_${installments}x` : paymentMethod
                }])
                .select()
                .single();

            if (saleError) throw saleError;

            // 2. Create Sale Items
            const saleItems = cart.map(item => ({
                sale_id: sale.id,
                product_id: item.id,
                quantity: item.quantity,
                unit_price: item.price
            }));

            const { error: itemsError } = await supabase
                .from('sale_items')
                .insert(saleItems);

            if (itemsError) throw itemsError;

            // 3. Create Installments if applicable
            if (paymentType === 'installment') {
                const installmentAmount = total / installments;
                const installmentData = Array.from({ length: installments }).map((_, index) => {
                    const dueDate = new Date();
                    dueDate.setDate(dueDate.getDate() + (30 * (index + 1))); // 30, 60, 90 days...

                    return {
                        sale_id: sale.id,
                        installment_number: index + 1,
                        due_date: dueDate.toISOString(),
                        amount: installmentAmount,
                        status: 'pending'
                    };
                });

                const { error: installmentError } = await supabase
                    .from('installments')
                    .insert(installmentData);

                if (installmentError) throw installmentError;
            }

            // 4. Update Stock
            for (const item of cart) {
                const { data: currentProduct } = await supabase
                    .from('products')
                    .select('stock_quantity')
                    .eq('id', item.id)
                    .single();

                if (currentProduct) {
                    await supabase
                        .from('products')
                        .update({ stock_quantity: currentProduct.stock_quantity - item.quantity })
                        .eq('id', item.id);
                }
            }

            // 5. Generate Receipt
            generateReceipt(sale.id);

            // 6. Register in Cash Flow if it's a cash sale
            if (paymentType === 'cash') {
                // Check for open register
                const { data: register } = await supabase
                    .from('cash_registers')
                    .select('id')
                    .eq('user_id', user?.id)
                    .eq('status', 'open')
                    .single();

                if (register) {
                    const clientName = clients.find(c => c.id === selectedClient)?.name || 'Cliente';
                    await supabase.from('cash_transactions').insert([{
                        register_id: register.id,
                        sale_id: sale.id,
                        description: `Venda #${sale.id.slice(0, 8)} - ${clientName}`,
                        amount: paymentMethod === 'money' ? (amountPaid > total ? total : amountPaid) : total,
                        type: 'sale'
                    }]);
                }
            }

            // Reset
            setCart([]);
            setSelectedClient('');
            setAmountPaid(0);
            setPaymentType('cash');
            setInstallments(2);
            fetchProducts(); // Refresh stock
            alert('Venda realizada com sucesso!');

        } catch (error: any) {
            console.error('Error processing sale:', error);
            alert('Erro ao processar venda: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-100px)]">
            {/* Left Side - Product Selection */}
            <div className="flex-1 flex flex-col bg-white rounded-lg shadow overflow-hidden">
                <div className="p-4 border-b space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar produtos..."
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {filteredProducts.map(product => (
                        <div
                            key={product.id}
                            onClick={() => addToCart(product)}
                            className="border rounded-lg p-4 cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-medium text-gray-900">{product.name}</h3>
                                <span className="text-sm text-gray-500">{product.code}</span>
                            </div>
                            <div className="flex justify-between items-end">
                                <span className="text-lg font-bold text-blue-600">
                                    R$ {product.price.toFixed(2)}
                                </span>
                                <span className="text-xs text-gray-500">
                                    Estoque: {product.stock_quantity}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right Side - Cart & Checkout */}
            <div className="w-full lg:w-96 bg-white rounded-lg shadow flex flex-col">
                <div className="p-4 border-b bg-gray-50">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        <ShoppingCart className="h-5 w-5" />
                        Carrinho
                    </h2>
                </div>

                <div className="p-4 border-b">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Cliente</label>
                    <div className="relative">
                        <User className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                        <select
                            value={selectedClient}
                            onChange={e => setSelectedClient(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none appearance-none bg-white"
                        >
                            <option value="">Selecione um cliente...</option>
                            {clients.map(client => (
                                <option key={client.id} value={client.id}>{client.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {cart.length === 0 ? (
                        <div className="text-center text-gray-500 mt-10">
                            Carrinho vazio
                        </div>
                    ) : (
                        cart.map(item => (
                            <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                                <div className="flex-1">
                                    <h4 className="font-medium text-sm">{item.name}</h4>
                                    <div className="text-xs text-gray-500">
                                        R$ {item.price.toFixed(2)} un
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => updateQuantity(item.id, -1)}
                                            className="p-1 hover:bg-gray-200 rounded"
                                        >
                                            <Minus className="h-3 w-3" />
                                        </button>
                                        <span className="text-sm font-medium w-4 text-center">{item.quantity}</span>
                                        <button
                                            onClick={() => updateQuantity(item.id, 1)}
                                            className="p-1 hover:bg-gray-200 rounded"
                                        >
                                            <Plus className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => removeFromCart(item.id)}
                                        className="text-red-500 hover:text-red-700 p-1"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 space-y-4">
                    {/* Payment Type Toggle */}
                    <div className="flex bg-gray-200 rounded-lg p-1">
                        <button
                            className={`flex-1 py-1 text-sm font-medium rounded-md transition-colors ${paymentType === 'cash' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                            onClick={() => setPaymentType('cash')}
                        >
                            À Vista
                        </button>
                        <button
                            className={`flex-1 py-1 text-sm font-medium rounded-md transition-colors ${paymentType === 'installment' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-900'}`}
                            onClick={() => setPaymentType('installment')}
                        >
                            Parcelado
                        </button>
                    </div>

                    {paymentType === 'cash' ? (
                        <>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">Forma de Pagamento</label>
                                <select
                                    value={paymentMethod}
                                    onChange={e => setPaymentMethod(e.target.value)}
                                    className="w-full p-2 border rounded-lg"
                                >
                                    <option value="pix">PIX</option>
                                    <option value="money">Dinheiro</option>
                                    <option value="debit">Débito</option>
                                    <option value="credit">Crédito (1x)</option>
                                </select>
                            </div>

                            {paymentMethod === 'money' && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Valor Pago</label>
                                    <input
                                        type="number"
                                        value={amountPaid}
                                        onChange={e => setAmountPaid(parseFloat(e.target.value))}
                                        className="w-full p-2 border rounded-lg"
                                        placeholder="0.00"
                                    />
                                    {amountPaid > total && (
                                        <div className="text-sm text-green-600 mt-1">
                                            Troco: R$ {change.toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">Número de Parcelas</label>
                            <select
                                value={installments}
                                onChange={e => setInstallments(parseInt(e.target.value))}
                                className="w-full p-2 border rounded-lg"
                            >
                                {[2, 3, 4, 5, 6, 10, 12].map(num => (
                                    <option key={num} value={num}>{num}x</option>
                                ))}
                            </select>
                            <div className="text-sm text-gray-500 mt-1">
                                Valor da parcela: R$ {(total / installments).toFixed(2)}
                            </div>
                        </div>
                    )}

                    <div className="flex justify-between items-center text-lg font-bold pt-2 border-t">
                        <span>Total</span>
                        <span>R$ {total.toFixed(2)}</span>
                    </div>

                    <button
                        onClick={handleCheckout}
                        disabled={loading || cart.length === 0 || !selectedClient}
                        className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                    >
                        {loading ? 'Processando...' : (
                            <>
                                <FileText className="h-5 w-5" />
                                Finalizar Venda
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
