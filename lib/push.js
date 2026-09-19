'use client'

import { subscribeUserToPush } from '@/lib/push' // Ajuste o caminho conforme onde salvou o código

export default function PushNotificationButton() {
  const handleEnablePush = async () => {
    try {
      // 1. Pede permissão ao utilizador no telemóvel
      const permission = await Notification.requestPermission()
      
      if (permission === 'granted') {
        // 2. Executa a função que regista o Service Worker e submete ao servidor
        await subscribeUserToPush()
        alert('Notificações ativadas com sucesso!')
      } else {
        alert('Permissão para notificações negada.')
      }
    } catch (error) {
      console.error('Erro ao ativar push:', error)
    }
  }

  return (
    <button onClick={handleEnablePush} className="bg-blue-600 text-white p-2 rounded">
      Ativar Notificações Push
    </button>
  )
}